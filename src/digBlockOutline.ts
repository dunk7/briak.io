import * as THREE from 'three'

const _center = new THREE.Vector3()
const _size = new THREE.Vector3()

/** White edge highlight on the active dig target (disabled in Potato graphics). */
export class DigBlockOutline {
  private readonly edges: THREE.LineSegments
  private enabled = true

  constructor(parent: THREE.Object3D) {
    const box = new THREE.BoxGeometry(1, 1, 1)
    this.edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(box),
      new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.72,
        depthTest: true,
        depthWrite: false,
      }),
    )
    box.dispose()
    this.edges.raycast = () => {}
    this.edges.renderOrder = 4
    this.edges.frustumCulled = false
    this.edges.visible = false
    parent.add(this.edges)
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled
    if (!enabled) this.edges.visible = false
  }

  setFromBox(box: THREE.Box3) {
    if (!this.enabled || box.isEmpty()) {
      this.edges.visible = false
      return
    }
    box.getCenter(_center)
    box.getSize(_size)
    this.edges.position.copy(_center)
    const pad = 1.006
    this.edges.scale.set(
      Math.max(_size.x * pad, 0.01),
      Math.max(_size.y * pad, 0.01),
      Math.max(_size.z * pad, 0.01),
    )
    this.edges.visible = true
  }

  clear() {
    this.edges.visible = false
  }

  dispose() {
    this.edges.parent?.remove(this.edges)
    this.edges.geometry.dispose()
    ;(this.edges.material as THREE.Material).dispose()
  }
}
