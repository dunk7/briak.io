import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { InventoryItem } from './inventory'
import { resolveBowPullingSvg, resolveItemIconSvg } from './itemIcons'

const ICON_SIZE = 16
/** Thickness relative to one pixel — Minecraft items are about 1 texel deep. */
const THICKNESS_PX = 1

type Pixel = { r: number; g: number; b: number }

const geometryCache = new Map<string, THREE.BufferGeometry>()
const materialCache = new Map<number, THREE.MeshStandardMaterial>()

function parseHexColor(fill: string): Pixel | null {
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(fill.trim())
  if (!m) return null
  const hex = m[1]!
  if (hex.length === 3) {
    return {
      r: parseInt(hex[0]! + hex[0]!, 16),
      g: parseInt(hex[1]! + hex[1]!, 16),
      b: parseInt(hex[2]! + hex[2]!, 16),
    }
  }
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  }
}

function colorKey(p: Pixel): number {
  return (p.r << 16) | (p.g << 8) | p.b
}

function blend(dst: Pixel | null, src: Pixel, opacity: number): Pixel {
  if (!dst || opacity >= 0.999) return { ...src }
  const a = Math.min(1, Math.max(0, opacity))
  return {
    r: Math.round(dst.r + (src.r - dst.r) * a),
    g: Math.round(dst.g + (src.g - dst.g) * a),
    b: Math.round(dst.b + (src.b - dst.b) * a),
  }
}

function parseAttrs(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)="([^"]*)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(tag))) {
    attrs[m[1]!] = m[2]!
  }
  return attrs
}

function paintPixel(
  grid: (Pixel | null)[],
  x: number,
  y: number,
  fill: Pixel,
  opacity: number,
) {
  if (x < 0 || y < 0 || x >= ICON_SIZE || y >= ICON_SIZE) return
  const i = y * ICON_SIZE + x
  grid[i] = blend(grid[i] ?? null, fill, opacity)
}

function pointInPolygon(px: number, py: number, pts: { x: number; y: number }[]): boolean {
  // Ray cast; treat pixel centers.
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i]!.x
    const yi = pts[i]!.y
    const xj = pts[j]!.x
    const yj = pts[j]!.y
    const intersect =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-12) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function fillPolygon(
  grid: (Pixel | null)[],
  pointsAttr: string,
  fill: Pixel,
  opacity: number,
) {
  const nums = pointsAttr
    .trim()
    .split(/[\s,]+/)
    .map(Number)
    .filter((n) => Number.isFinite(n))
  const pts: { x: number; y: number }[] = []
  for (let i = 0; i + 1 < nums.length; i += 2) {
    pts.push({ x: nums[i]!, y: nums[i + 1]! })
  }
  if (pts.length < 3) return

  let minX = ICON_SIZE
  let minY = ICON_SIZE
  let maxX = 0
  let maxY = 0
  for (const p of pts) {
    minX = Math.min(minX, Math.floor(p.x))
    minY = Math.min(minY, Math.floor(p.y))
    maxX = Math.max(maxX, Math.ceil(p.x))
    maxY = Math.max(maxY, Math.ceil(p.y))
  }
  minX = Math.max(0, minX)
  minY = Math.max(0, minY)
  maxX = Math.min(ICON_SIZE - 1, maxX)
  maxY = Math.min(ICON_SIZE - 1, maxY)

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (pointInPolygon(x + 0.5, y + 0.5, pts)) {
        paintPixel(grid, x, y, fill, opacity)
      }
    }
  }
}

function fillCircle(
  grid: (Pixel | null)[],
  cx: number,
  cy: number,
  r: number,
  fill: Pixel,
  opacity: number,
) {
  const r2 = r * r
  const minX = Math.max(0, Math.floor(cx - r))
  const maxX = Math.min(ICON_SIZE - 1, Math.ceil(cx + r))
  const minY = Math.max(0, Math.floor(cy - r))
  const maxY = Math.min(ICON_SIZE - 1, Math.ceil(cy + r))
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x + 0.5 - cx
      const dy = y + 0.5 - cy
      if (dx * dx + dy * dy <= r2) paintPixel(grid, x, y, fill, opacity)
    }
  }
}

/**
 * Rasterize a 16×16 SVG into a pixel grid. The full-canvas backdrop rect
 * (if present) is treated as transparent so tools keep a silhouette.
 */
export function rasterizeIconSvg(svg: string): (Pixel | null)[] {
  const grid: (Pixel | null)[] = Array.from({ length: ICON_SIZE * ICON_SIZE }, () => null)
  let backdrop: Pixel | null = null
  let shapeIndex = 0

  const shapeRe = /<(rect|polygon|circle)\b([^>]*)\/?>/g
  let match: RegExpExecArray | null
  while ((match = shapeRe.exec(svg))) {
    const tag = match[1]!
    const attrs = parseAttrs(match[2] ?? '')
    const opacity = attrs.opacity !== undefined ? Number(attrs.opacity) : 1
    const fill = parseHexColor(attrs.fill ?? '')
    if (!fill || opacity < 0.08) {
      shapeIndex++
      continue
    }

    if (tag === 'rect') {
      const x = Math.round(Number(attrs.x ?? 0))
      const y = Math.round(Number(attrs.y ?? 0))
      const w = Math.round(Number(attrs.width ?? 0))
      const h = Math.round(Number(attrs.height ?? 0))
      if (!(w > 0) || !(h > 0)) {
        shapeIndex++
        continue
      }
      if (
        shapeIndex === 0 &&
        x === 0 &&
        y === 0 &&
        w === ICON_SIZE &&
        h === ICON_SIZE
      ) {
        backdrop = fill
        shapeIndex++
        continue
      }
      for (let py = y; py < y + h; py++) {
        for (let px = x; px < x + w; px++) {
          paintPixel(grid, px, py, fill, opacity)
        }
      }
    } else if (tag === 'polygon') {
      fillPolygon(grid, attrs.points ?? '', fill, opacity)
    } else if (tag === 'circle') {
      fillCircle(
        grid,
        Number(attrs.cx ?? 0),
        Number(attrs.cy ?? 0),
        Number(attrs.r ?? 0),
        fill,
        opacity,
      )
    }
    shapeIndex++
  }

  if (backdrop) {
    const bg = colorKey(backdrop)
    for (let i = 0; i < grid.length; i++) {
      const p = grid[i]
      if (p && colorKey(p) === bg) grid[i] = null
    }
  }

  return grid
}

export function rasterizeItemIcon(item: InventoryItem): (Pixel | null)[] {
  return rasterizeIconSvg(resolveItemIconSvg(item))
}

function materialForColor(key: number): THREE.MeshStandardMaterial {
  let mat = materialCache.get(key)
  if (mat) return mat
  mat = new THREE.MeshStandardMaterial({
    color: key,
    roughness: 0.72,
    metalness: 0.08,
    flatShading: true,
    fog: true,
  })
  materialCache.set(key, mat)
  return mat
}

function buildExtrudedGeometryFromSvg(
  cacheKey: string,
  svg: string,
): THREE.BufferGeometry {
  const cached = geometryCache.get(cacheKey)
  if (cached) return cached

  const pixels = rasterizeIconSvg(svg)
  const byColor = new Map<number, THREE.BufferGeometry[]>()
  const pixel = 1
  const depth = THICKNESS_PX

  for (let y = 0; y < ICON_SIZE; y++) {
    for (let x = 0; x < ICON_SIZE; x++) {
      const p = pixels[y * ICON_SIZE + x]
      if (!p) continue
      const key = colorKey(p)
      const box = new THREE.BoxGeometry(pixel, pixel, depth)
      // Origin at icon center; +Y up, +X right, SVG y grows downward.
      box.translate(
        x - ICON_SIZE / 2 + 0.5,
        ICON_SIZE / 2 - y - 0.5,
        0,
      )
      let list = byColor.get(key)
      if (!list) {
        list = []
        byColor.set(key, list)
      }
      list.push(box)
    }
  }

  const parts: THREE.BufferGeometry[] = []
  for (const [key, geos] of byColor) {
    const merged = mergeGeometries(geos, false)
    for (const g of geos) g.dispose()
    if (!merged) continue
    merged.userData.colorKey = key
    parts.push(merged)
  }

  if (parts.length === 0) {
    // Fallback for icons that failed to rasterize.
    const empty = new THREE.BoxGeometry(10, 10, THICKNESS_PX)
    empty.userData.colorKeys = [0xcccccc]
    geometryCache.set(cacheKey, empty)
    return empty
  }

  if (parts.length === 1) {
    const only = parts[0]!
    only.userData.colorKeys = [only.userData.colorKey as number]
    geometryCache.set(cacheKey, only)
    return only
  }

  const colorKeys: number[] = []
  for (const p of parts) colorKeys.push(p.userData.colorKey as number)
  const mergedAll = mergeGeometries(parts, true)
  for (const p of parts) p.dispose()
  if (!mergedAll) {
    const empty = new THREE.BoxGeometry(10, 10, THICKNESS_PX)
    empty.userData.colorKeys = [0xcccccc]
    geometryCache.set(cacheKey, empty)
    return empty
  }

  mergedAll.userData.colorKeys = colorKeys
  geometryCache.set(cacheKey, mergedAll)
  return mergedAll
}

export type ExtrudedItemOpts = {
  /** World-space width of the full 16px icon. */
  size?: number
  /** Extra uniform scale after size. */
  scale?: number
  castShadow?: boolean
  receiveShadow?: boolean
  /** Disable depth test (first-person viewmodel). */
  viewmodel?: boolean
}

/**
 * Minecraft-style extruded icon mesh: flat pixel art with 1-texel thickness.
 * Geometry is cached per item; each call returns a fresh Object3D + materials.
 */
export function createExtrudedItemMesh(
  item: InventoryItem,
  opts: ExtrudedItemOpts = {},
): THREE.Object3D {
  return createExtrudedMeshFromSvg(item, resolveItemIconSvg(item), opts)
}

/** Extrude an arbitrary 16×16 SVG (cached by `cacheKey`). */
export function createExtrudedMeshFromSvg(
  cacheKey: string,
  svg: string,
  opts: ExtrudedItemOpts = {},
): THREE.Object3D {
  const size = opts.size ?? 0.36
  const scale = opts.scale ?? 1
  const viewmodel = opts.viewmodel ?? false
  const castShadow = opts.castShadow ?? !viewmodel
  const receiveShadow = opts.receiveShadow ?? false

  const geo = buildExtrudedGeometryFromSvg(cacheKey, svg)
  const colorKeys: number[] =
    (geo.userData.colorKeys as number[] | undefined) ??
    (geo.userData.colorKey !== undefined ? [geo.userData.colorKey as number] : [0x888888])

  const materials = colorKeys.map((key) => {
    const base = materialForColor(key)
    const mat = base.clone()
    if (viewmodel) mat.fog = false
    return mat
  })

  const mesh = new THREE.Mesh(
    geo,
    materials.length === 1 ? materials[0]! : materials,
  )
  mesh.castShadow = castShadow
  mesh.receiveShadow = receiveShadow
  mesh.raycast = () => {}

  const root = new THREE.Group()
  root.add(mesh)
  // Geometry is authored in pixel units (16×16). Scale to world size.
  root.scale.setScalar((size / ICON_SIZE) * scale)
  root.userData.cacheKey = cacheKey
  return root
}

/** Apply the shared first-person held orientation around an extruded icon mesh. */
function orientHeldExtruded(
  mesh: THREE.Object3D,
  size: number,
  /** Twist around the arm/capsule long axis (degrees). */
  armTwistDeg = -30,
): THREE.Object3D {
  const root = new THREE.Group()
  const DEG = Math.PI / 180
  // Icons are authored handle bottom-left → tip top-right. Roll +45° so the
  // handle sits down in the grip and the tip points up (right-hand ready).
  mesh.rotation.z = 45 * DEG
  // Nudge so the handle (now at the bottom) rests on the mount, not the center.
  mesh.position.set(0, size * 0.3, 0)

  // Tip for the right-hand viewmodel: lean into the world and toward screen
  // center so a swing leads with the tool head, not the butt.
  const oriented = new THREE.Group()
  oriented.name = 'heldOriented'
  oriented.add(mesh)
  oriented.rotation.order = 'YXZ'
  oriented.rotation.set(
    -30 * DEG, // pitch forward into the strike
    -38 * DEG, // yaw left toward center (right hand is on the right)
    -8 * DEG, // slight bank into the leftward slice
  )
  oriented.position.set(0.02, 0.02, 0.04)

  // Twist along the arm/capsule axis (local Y).
  root.rotation.y = armTwistDeg * DEG
  root.add(oriented)
  return root
}

/**
 * First-person bow pose — flatter to the camera like Minecraft's
 * `firstperson_righthand` display (rotation ≈ [0, -90, 25]), not the tool swing tip.
 */
function orientHeldBow(mesh: THREE.Object3D, size: number): THREE.Object3D {
  const root = new THREE.Group()
  const DEG = Math.PI / 180
  // Handle down along the grip.
  mesh.rotation.z = 45 * DEG
  mesh.position.set(0, size * 0.2, 0)

  const oriented = new THREE.Group()
  oriented.name = 'heldOriented'
  oriented.add(mesh)
  oriented.rotation.order = 'YXZ'
  // Face the camera more (readable bow sprite) with a mild Minecraft-like roll.
  // Positive pitch tips the bow up (negative was reading as down).
  oriented.rotation.set(
    2 * DEG,
    -18 * DEG,
    18 * DEG,
  )
  oriented.position.set(0.01, 0.05, 0.03)

  // Arm-axis twist the player settled on.
  root.rotation.y = -70 * DEG
  root.add(oriented)
  return root
}

/** First-person held pose — same extruded mesh as ground drops. */
export function createHeldExtrudedItem(item: InventoryItem): THREE.Object3D {
  const size = item === 'bow' ? 0.5 : 0.42
  const mesh = createExtrudedItemMesh(item, {
    size,
    viewmodel: true,
    castShadow: false,
    receiveShadow: false,
  })
  mesh.name = 'heldIcon'
  if (item === 'bow') return orientHeldBow(mesh, size)
  return orientHeldExtruded(mesh, size, -30)
}

/**
 * Minecraft-style bow pull stage for the viewmodel (0 = light, 1 = full).
 * Tip colors match the arrow that will be loosed.
 */
export function createHeldBowPullingItem(
  stage: 0 | 1,
  arrow: InventoryItem,
): THREE.Object3D {
  const size = 0.5
  const cacheKey = `bow_pulling_v2_${stage}_${arrow}`
  const mesh = createExtrudedMeshFromSvg(
    cacheKey,
    resolveBowPullingSvg(stage, arrow),
    {
      size,
      viewmodel: true,
      castShadow: false,
      receiveShadow: false,
    },
  )
  mesh.name = 'heldIcon'
  return orientHeldBow(mesh, size)
}

/** Ground / death-drop visual: upright icon ready for bob + spin. */
export function createGroundExtrudedItem(item: InventoryItem): THREE.Object3D {
  return createExtrudedItemMesh(item, {
    size: 0.42,
    castShadow: true,
    receiveShadow: true,
  })
}
