import * as THREE from 'three'

const STAGE_COUNT = 12
const TEX_SIZE = 256

const _center = new THREE.Vector3()
const _size = new THREE.Vector3()

/** Deterministic RNG so the fracture network is stable across stages. */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type CrackSegment = {
  x1: number
  y1: number
  x2: number
  y2: number
  width: number
  /** Progress in [0,1] at which this segment first appears. */
  born: number
}

/**
 * Build a branching fracture network that radiates from the impact point.
 * Each segment carries a `born` time so cracks grow outward as mining
 * progresses instead of randomly re-shuffling every stage.
 */
function buildFractureNetwork(seed: number, size: number): CrackSegment[] {
  const rng = mulberry32(seed)
  const segments: CrackSegment[] = []
  const cx = size * 0.5
  const cy = size * 0.5
  const maxReach = size * 0.46

  const grow = (
    x: number,
    y: number,
    angle: number,
    born: number,
    width: number,
    depth: number,
  ) => {
    let px = x
    let py = y
    let ang = angle
    let traveled = 0
    const startDist = Math.hypot(x - cx, y - cy)
    // Crack runs until it nears the tile edge or runs out of length budget.
    const budget = maxReach - startDist
    if (budget <= size * 0.04) return

    const steps = 4 + Math.floor(rng() * 4)
    const stepLen = budget / steps
    let w = width

    for (let i = 0; i < steps; i++) {
      ang += (rng() - 0.5) * 0.7
      const len = stepLen * (0.7 + rng() * 0.6)
      const nx = px + Math.cos(ang) * len
      const ny = py + Math.sin(ang) * len
      traveled += len
      const segBorn = Math.min(0.99, born + (traveled / maxReach) * 0.85)
      w = Math.max(0.6, w * 0.86)
      segments.push({ x1: px, y1: py, x2: nx, y2: ny, width: w, born: segBorn })

      // Spawn the occasional branch for a more shattered look.
      if (depth < 2 && i > 0 && rng() < 0.32) {
        const side = rng() < 0.5 ? 1 : -1
        grow(
          nx,
          ny,
          ang + side * (0.5 + rng() * 0.5),
          segBorn + 0.04,
          w * 0.8,
          depth + 1,
        )
      }

      px = nx
      py = ny
      if (Math.hypot(px - cx, py - cy) >= maxReach) break
    }
  }

  // Main radial cracks from the impact point.
  const mainCount = 5 + Math.floor(rng() * 2)
  const baseAngle = rng() * Math.PI * 2
  for (let i = 0; i < mainCount; i++) {
    const angle = baseAngle + (i / mainCount) * Math.PI * 2 + (rng() - 0.5) * 0.5
    const born = (i / mainCount) * 0.35
    grow(cx, cy, angle, born, size * 0.018, 0)
  }

  return segments
}

const NETWORK = buildFractureNetwork(0x9e3779b1, TEX_SIZE)

function drawCrackStage(ctx: CanvasRenderingContext2D, progress: number, size: number) {
  ctx.clearRect(0, 0, size, size)
  if (progress <= 0) return

  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  const cx = size * 0.5
  const cy = size * 0.5

  // Soft impact bruise that deepens as the block weakens.
  const bruiseR = size * (0.1 + progress * 0.16)
  const bruise = ctx.createRadialGradient(cx, cy, 0, cx, cy, bruiseR)
  bruise.addColorStop(0, `rgba(15,11,8,${0.22 * progress})`)
  bruise.addColorStop(1, 'rgba(15,11,8,0)')
  ctx.fillStyle = bruise
  ctx.beginPath()
  ctx.arc(cx, cy, bruiseR, 0, Math.PI * 2)
  ctx.fill()

  for (const seg of NETWORK) {
    if (seg.born > progress) continue
    // Fade each crack in right after it is born so growth reads smoothly.
    const age = Math.min(1, (progress - seg.born) / 0.12)
    const alpha = 0.35 + 0.5 * progress

    // Light highlight offset to one side reads as a chiseled groove.
    ctx.strokeStyle = `rgba(255,250,240,${0.16 * age * progress})`
    ctx.lineWidth = seg.width * 1.05
    ctx.beginPath()
    ctx.moveTo(seg.x1 - 0.7, seg.y1 - 0.7)
    ctx.lineTo(seg.x2 - 0.7, seg.y2 - 0.7)
    ctx.stroke()

    // Dark crack core.
    ctx.strokeStyle = `rgba(20,15,11,${alpha * age})`
    ctx.lineWidth = seg.width
    ctx.beginPath()
    ctx.moveTo(seg.x1, seg.y1)
    ctx.lineTo(seg.x2, seg.y2)
    ctx.stroke()
  }

  // Late-stage spall chips around the impact center.
  if (progress > 0.55) {
    const chipRng = mulberry32(0x1234 + Math.floor(progress * 7))
    const chips = Math.floor((progress - 0.55) * 14)
    ctx.fillStyle = `rgba(12,9,6,${0.4 * progress})`
    for (let c = 0; c < chips; c++) {
      const a = chipRng() * Math.PI * 2
      const r = chipRng() * size * 0.3
      const px = cx + Math.cos(a) * r
      const py = cy + Math.sin(a) * r
      const cr = 1 + chipRng() * 2.5
      ctx.beginPath()
      ctx.arc(px, py, cr, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

export function createDigCrackStageTextures(): THREE.CanvasTexture[] {
  const stages: THREE.CanvasTexture[] = []
  for (let s = 0; s < STAGE_COUNT; s++) {
    const canvas = document.createElement('canvas')
    canvas.width = TEX_SIZE
    canvas.height = TEX_SIZE
    const ctx = canvas.getContext('2d')!
    const progress = s / (STAGE_COUNT - 1)
    drawCrackStage(ctx, progress, TEX_SIZE)
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.magFilter = THREE.LinearFilter
    tex.minFilter = THREE.LinearMipmapLinearFilter
    tex.generateMipmaps = true
    tex.anisotropy = 4
    tex.needsUpdate = true
    stages.push(tex)
  }
  return stages
}

export type DigCrackStyle = 'dirt' | 'stone' | 'wood'

const CRACK_TINT: Record<DigCrackStyle, number> = {
  dirt: 0xffffff,
  stone: 0xd8d8e0,
  wood: 0xe8dcc8,
}

function progressToStage(progress: number) {
  return Math.min(
    STAGE_COUNT - 1,
    Math.max(0, Math.round(progress * (STAGE_COUNT - 1))),
  )
}

type TriplanarUniforms = {
  uBoxMin: { value: THREE.Vector3 }
  uBoxInvSize: { value: THREE.Vector3 }
}

/**
 * Crack material that projects the crack texture onto whatever geometry it is
 * applied to, using world-space triplanar mapping normalized to the target's
 * bounding box. This keeps the crack glued to curved surfaces (rocks, trees,
 * surface caps) instead of floating on a box that pokes past the silhouette.
 */
function createConformingCrackMaterial(): {
  material: THREE.MeshBasicMaterial
  uniforms: TriplanarUniforms
} {
  const uniforms: TriplanarUniforms = {
    uBoxMin: { value: new THREE.Vector3() },
    uBoxInvSize: { value: new THREE.Vector3(1, 1, 1) },
  }
  const material = new THREE.MeshBasicMaterial({
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    toneMapped: false,
  })

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uBoxMin = uniforms.uBoxMin
    shader.uniforms.uBoxInvSize = uniforms.uBoxInvSize

    shader.vertexShader =
      'varying vec3 vCrackPos;\nvarying vec3 vCrackNormal;\n' +
      shader.vertexShader.replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vCrackPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
        vCrackNormal = mat3( modelMatrix ) * normal;`,
      )

    shader.fragmentShader =
      'varying vec3 vCrackPos;\nvarying vec3 vCrackNormal;\nuniform vec3 uBoxMin;\nuniform vec3 uBoxInvSize;\n' +
      shader.fragmentShader.replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
          vec3 crackUVW = ( vCrackPos - uBoxMin ) * uBoxInvSize;
          vec3 crackN = pow( abs( normalize( vCrackNormal ) ), vec3( 4.0 ) );
          crackN /= ( crackN.x + crackN.y + crackN.z + 1e-4 );
          vec4 crackX = texture2D( map, crackUVW.zy );
          vec4 crackY = texture2D( map, crackUVW.xz );
          vec4 crackZ = texture2D( map, crackUVW.xy );
          vec4 sampledDiffuseColor = crackX * crackN.x + crackY * crackN.y + crackZ * crackN.z;
          diffuseColor *= sampledDiffuseColor;
        #endif`,
      )
  }
  material.customProgramCacheKey = () => 'dig-crack-conform'
  return { material, uniforms }
}

/** Crack decal drawn on the target bounds while mining (no mesh wobble). */
export class DigCrackOverlay {
  private readonly group = new THREE.Group()
  private readonly geometry = new THREE.BoxGeometry(1, 1, 1)
  private readonly stages: THREE.Texture[]
  private texturesEnabled = true
  private mesh: THREE.Mesh | null = null
  private material: THREE.MeshBasicMaterial | null = null
  private style: DigCrackStyle = 'dirt'
  private lastBoxStage = -1

  // --- Conforming overlay (curved props) ---
  private confMaterial: THREE.MeshBasicMaterial | null = null
  private confUniforms: TriplanarUniforms | null = null
  private confMeshes: THREE.Mesh[] = []
  private confRoot: THREE.Object3D | null = null
  private lastConfStage = -1
  private readonly groupInverse = new THREE.Matrix4()

  constructor(parent: THREE.Object3D, stages: THREE.Texture[]) {
    this.stages = stages
    parent.add(this.group)
  }

  setStyle(style: DigCrackStyle) {
    if (this.style === style) return
    this.style = style
    if (this.material) this.material.color.setHex(CRACK_TINT[style])
    if (this.confMaterial) this.confMaterial.color.setHex(CRACK_TINT[style])
  }

  /** Potato tier: flat tint only, no crack texture maps. */
  setTexturesEnabled(enabled: boolean) {
    if (enabled === this.texturesEnabled) return
    this.texturesEnabled = enabled
    if (!enabled) {
      if (this.material) this.material.map = null
      if (this.confMaterial) this.confMaterial.map = null
    }
  }

  private applyStageToMaterials(stage: number) {
    const map = this.texturesEnabled ? this.stages[stage]! : null
    if (this.material) {
      this.material.map = map
      this.material.opacity = map ? 1 : 0.42
      this.material.needsUpdate = true
    }
    if (this.confMaterial) {
      this.confMaterial.map = map
      this.confMaterial.opacity = map ? 1 : 0.42
      this.confMaterial.needsUpdate = true
    }
  }

  setFromBox(box: THREE.Box3, progress: number) {
    if (box.isEmpty() || progress <= 0) {
      this.clear()
      return
    }
    this.clearConforming()

    const stage = progressToStage(progress)

    if (!this.material) {
      this.material = new THREE.MeshBasicMaterial({
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3,
        toneMapped: false,
      })
    }
    if (stage !== this.lastBoxStage) {
      this.applyStageToMaterials(stage)
      this.lastBoxStage = stage
    }
    this.material.color.setHex(CRACK_TINT[this.style])

    box.getCenter(_center)
    box.getSize(_size)

    if (!this.mesh) {
      this.mesh = new THREE.Mesh(this.geometry, this.material)
      this.mesh.renderOrder = 3
      this.mesh.frustumCulled = false
      this.group.add(this.mesh)
    }

    this.mesh.visible = true
    this.mesh.position.copy(_center)
    // Slightly inset so cracks sit on the surface, not past it.
    const inset = 0.998
    this.mesh.scale.set(
      Math.max(_size.x * inset, 0.01),
      Math.max(_size.y * inset, 0.01),
      Math.max(_size.z * inset, 0.01),
    )
  }

  /**
   * Draw cracks directly on a target's real meshes so the decal hugs curved
   * silhouettes. `box` is the world-space bounds used to center the crack.
   */
  setFromObject(root: THREE.Object3D, box: THREE.Box3, progress: number) {
    if (box.isEmpty() || progress <= 0) {
      this.clear()
      return
    }
    // The box overlay and conforming overlay are mutually exclusive.
    if (this.mesh) this.mesh.visible = false

    if (!this.confMaterial) {
      const built = createConformingCrackMaterial()
      this.confMaterial = built.material
      this.confUniforms = built.uniforms
    }

    const stage = progressToStage(progress)
    if (stage !== this.lastConfStage) {
      this.applyStageToMaterials(stage)
      this.lastConfStage = stage
    }
    this.confMaterial.color.setHex(CRACK_TINT[this.style])

    box.getCenter(_center)
    box.getSize(_size)
    if (this.confUniforms) {
      this.confUniforms.uBoxMin.value.copy(box.min)
      this.confUniforms.uBoxInvSize.value.set(
        1 / Math.max(_size.x, 1e-3),
        1 / Math.max(_size.y, 1e-3),
        1 / Math.max(_size.z, 1e-3),
      )
    }

    if (this.confRoot !== root) {
      this.rebuildConforming(root)
      this.confRoot = root
    }

    // Keep overlay clones aligned with the (static) source meshes.
    this.group.updateWorldMatrix(true, false)
    this.groupInverse.copy(this.group.matrixWorld).invert()
    for (const overlay of this.confMeshes) {
      const source = overlay.userData.crackSource as THREE.Mesh | undefined
      if (!source) continue
      source.updateWorldMatrix(true, false)
      overlay.matrix.multiplyMatrices(this.groupInverse, source.matrixWorld)
      overlay.matrixWorldNeedsUpdate = true
      overlay.visible = true
    }
  }

  private rebuildConforming(root: THREE.Object3D) {
    this.clearConforming()
    if (!this.confMaterial) return
    root.updateWorldMatrix(true, true)
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      const overlay = new THREE.Mesh(child.geometry, this.confMaterial!)
      overlay.matrixAutoUpdate = false
      overlay.frustumCulled = false
      overlay.castShadow = false
      overlay.receiveShadow = false
      overlay.renderOrder = 3
      overlay.userData.crackSource = child
      this.confMeshes.push(overlay)
      this.group.add(overlay)
    })
  }

  private clearConforming() {
    for (const overlay of this.confMeshes) this.group.remove(overlay)
    this.confMeshes.length = 0
    this.confRoot = null
    this.lastConfStage = -1
  }

  clear() {
    if (this.mesh) this.mesh.visible = false
    if (this.material) this.material.map = null
    this.lastBoxStage = -1
    this.clearConforming()
  }

  dispose() {
    this.clear()
    if (this.mesh) {
      this.group.remove(this.mesh)
      this.mesh = null
    }
    this.material?.dispose()
    this.material = null
    this.confMaterial?.dispose()
    this.confMaterial = null
    this.confUniforms = null
    this.geometry.dispose()
    for (const tex of this.stages) tex.dispose()
  }
}
