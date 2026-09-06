import * as THREE from 'three'
import type { ChassisRig, GridPosition, GridSize, InstalledServer } from '../systems/types'

export interface CellProjection { row: number; col: number; x: number; y: number; size: number }
export class InteriorScene {
  private scene = new THREE.Scene()
  private camera = new THREE.OrthographicCamera(-5, 5, 5, -5, .1, 100)
  private renderer = new THREE.WebGLRenderer({ antialias: true })
  private equipment = new THREE.Group()
  private highlight: THREE.Mesh
  private observer: ResizeObserver
  private geometry = new THREE.BoxGeometry(1, 1, 1)
  private materials = new Map<string, THREE.MeshStandardMaterial>()
  private disposed = false
  private frame = 0
  private signature = ''
  private raycaster = new THREE.Raycaster()
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)

  constructor(private host: HTMLElement, private grid: GridSize, private onSelect: (position: GridPosition | null) => void, private onProject: (cells: CellProjection[]) => void) {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5))
    this.renderer.setClearColor('#252b2c')
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.3
    this.camera.position.set(0, 20, 0)
    this.camera.up.set(0, 0, -1)
    this.camera.lookAt(0, 0, 0)
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8b9590, 2.6))
    const light = new THREE.DirectionalLight(0xfff6e6, 2)
    light.position.set(-4, 12, -6); this.scene.add(light)
    this.box(0, -.16, 0, grid.cols + 3.0, .22, grid.rows + 1.3, '#555e5d')
    for (let row = 0; row < grid.rows; row++) for (let col = 0; col < grid.cols; col++) {
      const x = col - (grid.cols - 1) / 2, z = row - (grid.rows - 1) / 2
      this.box(x, -.03, z, .965, .08, .965, (row + col) % 2 ? '#a9afad' : '#b6bcb9')
      for (const dx of [-.40, .40]) for (const dz of [-.40, .40]) this.box(x + dx, .019, z + dz, .026, .012, .026, '#69736e')
    }
    const left = -grid.cols / 2 - 1.35, right = grid.cols / 2 + 1.35
    const back = -grid.rows / 2 - .56, front = grid.rows / 2 + .56
    for (const x of [left, right]) this.box(x, .15, 0, .16, .5, grid.rows + 1.28, '#737b73')
    this.box(0, .15, back, grid.cols + 2.85, .5, .16, '#737b73')
    const doorWidth = grid.cols * .78
    this.box(0, .025, front, doorWidth, .06, .30, '#a0a79f')
    for (let i = 0; i < 9; i++) this.box(0, .07, front - .12 + i * .028, doorWidth, .025, .012, '#566059')
    for (const side of [-1, 1]) this.box(side * (doorWidth / 2 + .08), .15, front, .15, .5, .3, '#75816e')
    this.box(0, -.1, front + .32, doorWidth + .3, .04, .3, '#444e49')
    // Fixed furniture lives outside the playable cells.
    this.box(left + .48, .26, back + .67, .64, .5, 1.0, '#77634a')
    this.box(left + .48, .53, back + .67, .68, .055, 1.05, '#b39872')
    for (let i = 0; i < 4; i++) this.box(left + .49, .57, back + .35 + i * .2, .36, .02, .04, '#455451')
    this.box(right - .44, .26, back + .7, .54, .52, 1.02, '#435e5b')
    for (let i = 0; i < 4; i++) this.box(right - .44, .53, back + .35 + i * .2, .48, .025, .035, '#7b9990')
    this.box(right - .40, .10, .45, .50, .18, .52, '#333c3a')
    this.box(right - .40, .20, .45, .32, .03, .32, '#767b70')
    this.box(right - .40, .10, 1.12, .50, .18, .52, '#333c3a')
    this.box(right - .40, .20, 1.12, .32, .03, .32, '#767b70')
    this.box(left + .22, .32, .35, .22, .45, .6, '#94a492')
    this.box(left + .24, .56, .35, .10, .02, .20, '#c0d59b')
    for (const x of [-grid.cols / 2 - .12, grid.cols / 2 + .12]) for (let i = 0; i < grid.rows * 5; i++) this.box(x, .028, -grid.rows / 2 + .1 + i * .2, .06, .015, .09, '#c5b888')
    this.highlight = new THREE.Mesh(new THREE.PlaneGeometry(.98, .98), new THREE.MeshBasicMaterial({ color: '#d5efb3', transparent: true, opacity: .28, depthWrite: false }))
    this.highlight.rotation.x = -Math.PI / 2; this.highlight.position.y = .026; this.highlight.visible = false
    this.scene.add(this.highlight, this.equipment)
    host.append(this.renderer.domElement)
    this.renderer.domElement.addEventListener('pointerup', this.click)
    this.observer = new ResizeObserver(() => this.resize())
    this.observer.observe(host)
    document.addEventListener('visibilitychange', this.visible)
    this.resize()
  }
  private material(color: string) {
    let material = this.materials.get(color)
    if (!material) { material = new THREE.MeshStandardMaterial({ color, roughness: .8, metalness: .12 }); this.materials.set(color, material) }
    return material
  }
  private box(x: number, y: number, z: number, w: number, h: number, d: number, color: string, parent: THREE.Object3D = this.scene) {
    const mesh = new THREE.Mesh(this.geometry, this.material(color)); mesh.position.set(x, y, z); mesh.scale.set(w, h, d); parent.add(mesh); return mesh
  }
  update(servers: InstalledServer[], selected: GridPosition | null, efficiency: number, rigs: ChassisRig[] = []) {
    const signature = JSON.stringify([servers, rigs, selected, efficiency.toFixed(2)])
    if (this.disposed || signature === this.signature) return
    this.signature = signature
    this.equipment.clear()
    for (const rig of rigs) {
      const x = rig.gridPosition.col - (this.grid.cols - 1) / 2, z = rig.gridPosition.row - (this.grid.rows - 1) / 2
      this.box(x, .08, z, .65, .10, .82, '#626d66', this.equipment)
      for (const dx of [-.27, .27]) this.box(x + dx, .24, z, .06, .30, .78, '#81928b', this.equipment)
    }
    for (const server of servers) {
      if (!server.gridPosition) continue
      const x = server.gridPosition.col - (this.grid.cols - 1) / 2, z = server.gridPosition.row - (this.grid.rows - 1) / 2
      const accent = efficiency < 1 ? '#c5b5a3' : server.chip === 'accelerator' ? '#8fbccc' : server.chip === 'pro-gpu' ? '#aab4d4' : '#bad79a'
      this.box(x + .035, .07, z + .055, .65, .06, .82, '#626d66', this.equipment)
      this.box(x, .24, z, .62, .32, .78, '#303b3b', this.equipment)
      this.box(x, .408, z, .53, .025, .69, '#536363', this.equipment)
      for (let index = 0; index < 5; index++) this.box(x, .426, z - .22 + index * .09, .37, .018, .034, '#233231', this.equipment)
      this.box(x, .445, z + .30, .47, .025, .065, accent, this.equipment)
      this.box(x - .18, .45, z - .28, .065, .027, .035, accent, this.equipment)
    }
    this.highlight.visible = selected !== null
    if (selected) this.highlight.position.set(selected.col - (this.grid.cols - 1) / 2, .46, selected.row - (this.grid.rows - 1) / 2)
    this.render()
  }
  private resize() {
    const width = Math.max(this.host.clientWidth, 1), height = Math.max(this.host.clientHeight, 1)
    this.renderer.setSize(width, height)
    const half = Math.max((this.grid.rows + 1.7) / 2, (this.grid.cols + 3.5) / 2 * height / width)
    this.camera.left = -half * width / height; this.camera.right = half * width / height; this.camera.top = half; this.camera.bottom = -half
    this.camera.updateProjectionMatrix(); this.camera.updateMatrixWorld()
    const cells: CellProjection[] = []
    const unit = width / (this.camera.right - this.camera.left)
    for (let row = 0; row < this.grid.rows; row++) for (let col = 0; col < this.grid.cols; col++) {
      const p = new THREE.Vector3(col - (this.grid.cols - 1) / 2, 0, row - (this.grid.rows - 1) / 2).project(this.camera)
      cells.push({ row, col, x: (p.x + 1) * width / 2, y: (1 - p.y) * height / 2, size: unit })
    }
    this.onProject(cells); this.renderer.render(this.scene, this.camera)
  }
  private render() {
    if (this.disposed || this.frame) return
    this.renderer.render(this.scene, this.camera)
  }
  private visible = () => { if (!document.hidden) this.render() }
  private click = (event: PointerEvent) => {
    if (event.button !== 0) return
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), this.camera)
    const point = this.raycaster.ray.intersectPlane(this.plane, new THREE.Vector3())
    if (!point) return
    const col = Math.floor(point.x + this.grid.cols / 2), row = Math.floor(point.z + this.grid.rows / 2)
    this.onSelect(row >= 0 && col >= 0 && row < this.grid.rows && col < this.grid.cols ? { row, col } : null)
  }
  destroy() {
    if (this.disposed) return
    this.disposed = true; cancelAnimationFrame(this.frame); this.observer.disconnect()
    document.removeEventListener('visibilitychange', this.visible)
    this.renderer.domElement.removeEventListener('pointerup', this.click)
    this.geometry.dispose(); this.highlight.geometry.dispose(); (this.highlight.material as THREE.Material).dispose()
    this.materials.forEach((material) => material.dispose()); this.renderer.dispose(); this.renderer.forceContextLoss(); this.renderer.domElement.remove()
  }
}
