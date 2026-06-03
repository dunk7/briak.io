import * as THREE from 'three'
import {
  damageEnemy,
  SPEAR_HIT_KNOCKBACK_SPEED,
  SPEAR_THROW_DAMAGE,
  type EnemyDeathContext,
  type EnemyInstance,
} from './enemy'

const SPEAR_SPEED = 22
const SPEAR_MAX_LIFE = 2.8
const _prev = new THREE.Vector3()
const _next = new THREE.Vector3()
const _dir = new THREE.Vector3()
const _hits: THREE.Intersection[] = []

export type ThrownSpear = {
  root: THREE.Group
  velocity: THREE.Vector3
  life: number
}

function createSpearMesh(): THREE.Group {
  const group = new THREE.Group()
  const handle = new THREE.MeshStandardMaterial({
    color: 0x5c3a22,
    roughness: 0.85,
    metalness: 0,
    flatShading: true,
    fog: false,
  })
  const tip = new THREE.MeshStandardMaterial({
    color: 0x9a9a92,
    roughness: 0.55,
    metalness: 0.1,
    flatShading: true,
    fog: false,
  })

  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.62), handle)
  shaft.position.z = -0.08
  shaft.castShadow = false
  shaft.receiveShadow = false

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.18), tip)
  head.position.z = 0.35
  head.castShadow = false
  head.receiveShadow = false

  group.add(shaft, head)
  return group
}

export function spawnThrownSpear(
  parent: THREE.Object3D,
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  spears: ThrownSpear[],
) {
  const root = createSpearMesh()
  root.position.copy(origin)
  root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction.clone().normalize())

  const vel = direction.clone().normalize().multiplyScalar(SPEAR_SPEED)

  parent.add(root)
  spears.push({
    root,
    velocity: vel,
    life: SPEAR_MAX_LIFE,
  })
}

function removeSpear(spear: ThrownSpear, parent: THREE.Object3D, spears: ThrownSpear[]) {
  parent.remove(spear.root)
  spear.root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose()
      if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose())
      else child.material.dispose()
    }
  })
  const i = spears.indexOf(spear)
  if (i >= 0) spears.splice(i, 1)
}

export function updateThrownSpears(
  dt: number,
  spears: ThrownSpear[],
  parent: THREE.Object3D,
  enemies: EnemyInstance[],
  enemiesGroup: THREE.Object3D,
  raycaster: THREE.Raycaster,
  deathCtx?: EnemyDeathContext,
) {
  if (spears.length === 0) return

  const pickMeshes = enemies.map((e) => e.pickMesh)

  for (let i = spears.length - 1; i >= 0; i--) {
    const spear = spears[i]!
    spear.life -= dt
    if (spear.life <= 0) {
      removeSpear(spear, parent, spears)
      continue
    }

    _prev.copy(spear.root.position)
    _next.copy(spear.velocity).multiplyScalar(dt).add(_prev)
    _dir.subVectors(_next, _prev)
    const stepLen = _dir.length()
    if (stepLen > 1e-5) {
      _dir.multiplyScalar(1 / stepLen)
      raycaster.set(_prev, _dir)
      raycaster.far = stepLen
      raycaster.near = 0
      _hits.length = 0
      raycaster.intersectObjects(pickMeshes, false, _hits)
      if (_hits.length > 0) {
        const hitMesh = _hits[0]!.object
        const enemy = enemies.find((e) => e.pickMesh === hitMesh)
        if (enemy) {
          damageEnemy(
            enemy,
            SPEAR_THROW_DAMAGE,
            enemiesGroup,
            enemies,
            _prev.x,
            _prev.z,
            SPEAR_HIT_KNOCKBACK_SPEED,
            deathCtx,
          )
        }
        removeSpear(spear, parent, spears)
        continue
      }
    }

    spear.root.position.copy(_next)
    spear.root.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      spear.velocity.clone().normalize(),
    )
  }
}

export function clearThrownSpears(
  spears: ThrownSpear[],
  parent: THREE.Object3D,
) {
  while (spears.length > 0) {
    removeSpear(spears[0]!, parent, spears)
  }
}
