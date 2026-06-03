import * as THREE from 'three'
import { cyclePhase, nightStrength } from './dayNight'

/** Unit-radius geometry; scaled each frame to stay inside `camera.far`. */
const SHELL_UNIT = 1
const MOON_UNIT_RADIUS = 0.034
const MOON_DIST_FRAC = 0.84
const SHELL_FRAC = 0.88
const _moonDir = new THREE.Vector3()
const _moonPos = new THREE.Vector3()
const _camPos = new THREE.Vector3()

const skyShellVertexShader = /* glsl */ `
varying vec3 vDir;
uniform vec3 uCameraPos;

void main() {
  vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
  vDir = normalize(worldPos - uCameraPos);
  vec4 mv = viewMatrix * vec4(worldPos, 1.0);
  gl_Position = projectionMatrix * mv;
}
`

const skyShellFragmentShader = /* glsl */ `
uniform float uTime;
uniform float uNight;
uniform vec3 uSunColor;
uniform vec3 uSkyTint;

varying vec3 vDir;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
        mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
        mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
    f.z);
}

float fbm3(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise3(p);
    p = p * 2.04 + vec3(1.7, 9.2, 3.4);
    a *= 0.5;
  }
  return v;
}

float cloudLayer(vec3 dir, float scale, vec2 wind, float bias) {
  vec3 samplePos = dir * scale + vec3(wind, 0.0);
  float n = fbm3(samplePos);
  float n2 = fbm3(samplePos * 1.9 + vec3(4.1, 2.3, 1.8));
  float d = n * 0.58 + n2 * 0.42;
  return smoothstep(bias, bias + 0.34, d);
}

void main() {
  vec3 dir = normalize(vDir);
  float elev = dir.y;

  // No clouds below the horizon — smooth fade, no hard cut plane.
  float horizonFade = smoothstep(-0.02, 0.28, elev);
  if (horizonFade < 0.001) discard;

  vec2 wind = vec2(uTime * 0.011, uTime * 0.005);
  float low = cloudLayer(dir, 2.8, wind, 0.44);
  float high = cloudLayer(dir, 4.6, wind * 0.7 + vec2(2.0, 1.0), 0.52) * 0.55;
  float density = (low * 0.75 + high * 0.45) * horizonFade;
  density = density * density;

  vec3 dayCol = mix(vec3(0.94, 0.96, 1.0), uSunColor, 0.14);
  vec3 nightCol = mix(vec3(0.14, 0.18, 0.32), uSkyTint * 0.55, 0.5);
  vec3 col = mix(dayCol, nightCol, uNight);

  float dayAlpha = density * 0.78;
  float nightAlpha = density * 0.08;
  float alpha = mix(dayAlpha, nightAlpha, uNight);

  if (alpha < 0.004) discard;
  gl_FragColor = vec4(col, alpha);
}
`

function createCloudDome(sunColor: THREE.Color, skyTint: THREE.Color): THREE.Mesh {
  const geo = new THREE.SphereGeometry(
    SHELL_UNIT,
    64,
    40,
    0,
    Math.PI * 2,
    0,
    Math.PI * 0.52,
  )
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uNight: { value: 0 },
      uSunColor: { value: sunColor.clone() },
      uSkyTint: { value: skyTint.clone() },
      uCameraPos: { value: new THREE.Vector3() },
    },
    vertexShader: skyShellVertexShader,
    fragmentShader: skyShellFragmentShader,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    depthTest: false,
    fog: true,
    side: THREE.BackSide,
    blending: THREE.NormalBlending,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.frustumCulled = false
  mesh.renderOrder = -3
  return mesh
}

function createStarField(): THREE.Points {
  const count = 4500
  const positions = new Float32Array(count * 3)
  const sizes = new Float32Array(count)
  const rnd = (() => {
    let s = 90210
    return () => {
      s = (s * 16807) % 2147483647
      return (s - 1) / 2147483646
    }
  })()

  let placed = 0
  while (placed < count) {
    const u = rnd()
    const v = rnd()
    const theta = 2 * Math.PI * u
    const phi = Math.acos(2 * v - 1)
    const sinPhi = Math.sin(phi)
    const y = Math.cos(phi)
    if (y < 0.08) continue

    const r = 0.97 + rnd() * 0.03
    const i = placed
    positions[i * 3] = r * sinPhi * Math.cos(theta)
    positions[i * 3 + 1] = r * y
    positions[i * 3 + 2] = r * sinPhi * Math.sin(theta)
    sizes[i] = 0.4 + rnd() * 1.6
    placed++
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1))

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uOpacity: { value: 0 },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      attribute float size;
      varying float vTwinkle;
      uniform float uTime;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float dist = max(-mv.z, 1.0);
        gl_PointSize = size * (300.0 / dist);
        vTwinkle = 0.8 + 0.2 * sin(uTime * 1.8 + position.x * 0.03 + position.z * 0.05);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      varying float vTwinkle;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        if (d > 0.5) discard;
        float soft = 1.0 - smoothstep(0.08, 0.48, d);
        vec3 col = mix(vec3(0.78, 0.86, 1.0), vec3(1.0, 0.97, 0.9), vTwinkle * 0.3);
        gl_FragColor = vec4(col, soft * uOpacity * vTwinkle);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })

  const stars = new THREE.Points(geo, mat)
  stars.frustumCulled = false
  stars.renderOrder = -5
  return stars
}

function createMoon(): {
  group: THREE.Group
  discMat: THREE.MeshBasicMaterial
  glowMat: THREE.ShaderMaterial
} {
  const group = new THREE.Group()

  const moonGeo = new THREE.SphereGeometry(MOON_UNIT_RADIUS, 40, 40)
  const discMat = new THREE.MeshBasicMaterial({
    color: 0xf2eee4,
    fog: false,
    transparent: true,
    opacity: 0,
  })
  const moon = new THREE.Mesh(moonGeo, discMat)
  moon.renderOrder = -2
  group.add(moon)

  const detailGeo = new THREE.SphereGeometry(MOON_UNIT_RADIUS * 1.001, 40, 40)
  const glowMat = new THREE.ShaderMaterial({
    uniforms: {
      uOpacity: { value: 1 },
      uCameraPos: { value: new THREE.Vector3() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      uniform vec3 uCameraPos;
      varying vec3 vWorldPos;
      varying vec3 vNormal;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(41.3, 289.7))) * 43758.5453);
      }

      void main() {
        vec3 n = normalize(vNormal);
        vec3 viewDir = normalize(uCameraPos - vWorldPos);
        float lat = atan(n.y, length(n.xz)) * 0.3183099 + 0.5;
        float lon = atan(n.z, n.x) * 0.15915494 + 0.5;
        vec2 uv = vec2(lon, lat) * 7.0;
        float cr = 0.0;
        for (int i = 0; i < 5; i++) {
          vec2 cell = floor(uv);
          vec2 f = fract(uv) - 0.5;
          float h = hash(cell + float(i));
          if (h > 0.58) {
            float r = 0.07 + (h - 0.58) * 0.3;
            cr = max(cr, smoothstep(r, r * 0.5, length(f)));
          }
          uv = uv * 1.4 + vec2(0.2, 0.15);
        }

        float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 2.0);
        vec3 col = vec3(0.93, 0.91, 0.86) * (1.0 - cr * 0.2);
        col += vec3(0.08, 0.1, 0.14) * fresnel * 0.35;
        float alpha = uOpacity;
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    fog: false,
  })
  const detail = new THREE.Mesh(detailGeo, glowMat)
  detail.renderOrder = -1
  group.add(detail)

  const haloGeo = new THREE.PlaneGeometry(MOON_UNIT_RADIUS * 5.5, MOON_UNIT_RADIUS * 5.5)
  const haloMat = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0.35 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        vec2 c = vUv - 0.5;
        float d = length(c);
        float glow = exp(-d * d * 14.0);
        gl_FragColor = vec4(0.72, 0.8, 1.0, glow * uOpacity);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  })
  const halo = new THREE.Mesh(haloGeo, haloMat)
  halo.renderOrder = -4
  group.add(halo)

  group.frustumCulled = false
  return { group, discMat, glowMat }
}

export interface SkyDecor {
  root: THREE.Group
  update(
    elapsedSec: number,
    cycleT: number,
    sunDirection: THREE.Vector3,
    camera: THREE.PerspectiveCamera,
    sunColor: THREE.Color,
    skyTint: THREE.Color,
    enabled: boolean,
    decorFade: number,
    dt: number,
  ): void
  dispose(): void
}

export function createSkyDecor(scene: THREE.Scene): SkyDecor {
  const root = new THREE.Group()
  root.name = 'skyDecor'

  const sunColor = new THREE.Color()
  const skyTint = new THREE.Color()
  const cloudDome = createCloudDome(sunColor, skyTint)
  const stars = createStarField()
  const { group: moon, discMat, glowMat } = createMoon()

  root.add(cloudDome, stars, moon)
  scene.add(root)

  const cloudUniforms = (cloudDome.material as THREE.ShaderMaterial).uniforms
  const starUniforms = (stars.material as THREE.ShaderMaterial).uniforms
  const haloMesh = moon.children[2] as THREE.Mesh
  const haloMat = haloMesh.material as THREE.ShaderMaterial
  let shellRSmooth = 200

  const dispose = () => {
    scene.remove(root)
    cloudDome.geometry.dispose()
    ;(cloudDome.material as THREE.Material).dispose()
    stars.geometry.dispose()
    ;(stars.material as THREE.Material).dispose()
    moon.traverse((c) => {
      if (c instanceof THREE.Mesh) {
        c.geometry.dispose()
        if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose())
        else c.material.dispose()
      }
    })
  }

  return {
    root,
    update(elapsedSec, cycleT, sunDirection, camera, sunCol, skyCol, enabled, decorFade, dt) {
      const fade = THREE.MathUtils.clamp(decorFade, 0, 1)
      root.visible = enabled && fade > 0.02
      if (!root.visible) return

      const night = nightStrength(cycleT)
      const phase = cyclePhase(elapsedSec)
      const dusk = 1 - Math.abs(phase - 0.75) / 0.12
      const dawn = 1 - Math.abs(phase - 0.25) / 0.12
      const twilight = THREE.MathUtils.clamp(Math.max(dusk, dawn), 0, 1)

      const shellTarget = Math.max(60, camera.far * SHELL_FRAC)
      shellRSmooth = THREE.MathUtils.damp(shellRSmooth, shellTarget, 4, dt)
      cloudDome.scale.setScalar(shellRSmooth)
      stars.scale.setScalar(shellRSmooth * 0.98)

      const cameraPosition = camera.position
      root.position.copy(cameraPosition)
      _camPos.copy(cameraPosition)

      cloudUniforms.uTime.value = elapsedSec
      cloudUniforms.uNight.value = night
      cloudUniforms.uSunColor.value.copy(sunCol)
      cloudUniforms.uSkyTint.value.copy(skyCol)
      cloudUniforms.uCameraPos.value.copy(_camPos)
      ;(cloudDome.material as THREE.ShaderMaterial).opacity = fade

      const starOpacity = fade * night * (0.65 + twilight * 0.2)
      starUniforms.uOpacity.value = starOpacity
      starUniforms.uTime.value = elapsedSec

      const moonFade = fade * THREE.MathUtils.smoothstep(night, 0.2, 0.6)
      _moonDir.copy(sunDirection).multiplyScalar(-1)
      if (_moonDir.y < 0.15) _moonDir.y = 0.15
      _moonDir.normalize()
      _moonPos.copy(cameraPosition).addScaledVector(_moonDir, shellRSmooth * MOON_DIST_FRAC)
      moon.scale.setScalar(shellRSmooth)
      moon.position.copy(_moonPos)
      moon.lookAt(cameraPosition)

      haloMesh.lookAt(cameraPosition)

      moon.visible = moonFade > 0.02
      discMat.opacity = moonFade
      glowMat.uniforms.uOpacity.value = moonFade
      glowMat.uniforms.uCameraPos.value.copy(cameraPosition)
      haloMat.uniforms.uOpacity.value = 0.38 * moonFade
    },
    dispose,
  }
}
