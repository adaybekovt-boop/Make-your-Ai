import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import type { ChassisRig, GridPosition, GridSize, InstalledServer } from '../systems/types'
import { cellWorld, ELEVATION, floorCell, ROW_SPACING } from './interiorLayout'

export interface CellProjection { row: number; col: number; x: number; y: number; size: number; height: number }
export class InteriorScene {
  private scene = new THREE.Scene()
  private camera = new THREE.OrthographicCamera(-5, 5, 5, -5, .1, 150)
  private renderer = new THREE.WebGLRenderer({ antialias: true })
  private equipment = new THREE.Group()
  private observer: ResizeObserver
  private disposed = false
  private signature = ''
  private raycaster = new THREE.Raycaster()
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  private templates = new Map<string, THREE.Group>()
  private assets: THREE.Group[] = []
  private materials = new Set<THREE.Material>()
  private selected: GridPosition | null = null
  private servers: InstalledServer[] = []
  private rigs: ChassisRig[] = []
  private efficiency = 1
  private focused = false

  constructor(private host: HTMLElement, private grid: GridSize, private onSelect: (position: GridPosition | null) => void, private onProject: (cells: CellProjection[]) => void, private locationId = 'garage', private onError: (message: string) => void = () => {}) {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5))
    this.renderer.setClearColor('#202b30')
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.15
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.scene.add(new THREE.HemisphereLight(0xe9f5ff, 0x66523d, 1.5))
    const light = new THREE.DirectionalLight(0xffe3ba, 2.2)
    light.position.set(-5, 9, 5); light.castShadow = true
    Object.assign(light.shadow.camera, { left: -15, right: 15, top: 20, bottom: -20 })
    light.shadow.mapSize.set(1024, 1024); light.shadow.normalBias = .03; light.shadow.bias = -.0003
    this.scene.add(light, this.equipment)
    host.append(this.renderer.domElement)
    this.renderer.domElement.addEventListener('pointerup', this.click)
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(host)
    document.addEventListener('visibilitychange', this.visible)
    this.resize()
    void this.load()
  }
  private async load() {
    const decoder = new DRACOLoader().setDecoderPath(`${import.meta.env.BASE_URL}models/metropolis/draco/`).setWorkerLimit(1)
    const loader = new GLTFLoader().setDRACOLoader(decoder)
    const id = this.locationId === 'overseas-west' ? 'server-hall' : this.locationId === 'overseas-east' ? 'campus' : this.locationId
    try {
      const manifest = await fetch(`${import.meta.env.BASE_URL}models/interiors/manifest.json`).then(r => { if (!r.ok) throw new Error('Манифест интерьеров недоступен'); return r.json() })
      const room = manifest.models.find((entry: { id: string }) => entry.id === id)
      if (!room) throw new Error('Интерьер отсутствует в манифесте')
      const requests = [{ key: 'room', url: `interiors/${room.file}` }, ...(id === 'hq' ? [] : ['rack-basic', 'rack-cooled', 'rack-enterprise'].map(key => ({ key, url: `racks/${key}.glb` })))]
      const results = await Promise.allSettled(requests.map(async ({ key, url }) => {
        const asset = (await loader.loadAsync(`${import.meta.env.BASE_URL}models/${url}`)).scene
        if (this.disposed) { this.disposeAsset(asset); return }
        this.assets.push(asset)
        asset.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true } })
        if (key === 'room') this.scene.add(asset); else this.templates.set(key, asset)
      }))
      if (this.disposed) return
      if (results.some(r => r.status === 'rejected')) throw new Error('Не удалось загрузить 3D-модели помещения. Вернитесь на карту и повторите вход.')
      this.signature = ''; this.update(this.servers, this.selected, this.efficiency, this.rigs)
      this.host.dataset.interiorReady = id
    } catch (error) { if (!this.disposed) this.onError(error instanceof Error ? error.message : 'Ошибка загрузки интерьера') } finally { decoder.dispose() }
  }
  update(servers: InstalledServer[], selected: GridPosition | null, efficiency: number, rigs: ChassisRig[] = []) {
    this.servers = servers; this.rigs = rigs; this.efficiency = efficiency
    if (!selected || selected.row !== this.selected?.row || selected.col !== this.selected?.col) this.focused = false
    this.selected = selected
    const signature = JSON.stringify([servers, rigs, selected, efficiency.toFixed(2)])
    if (this.disposed || signature === this.signature) return
    this.signature = signature
    this.equipment.children.forEach(o => { if (o instanceof THREE.InstancedMesh) o.dispose() })
    this.equipment.clear(); this.materials.forEach(m => m.dispose()); this.materials.clear()
    const batches = new Map<string, (InstalledServer | ChassisRig)[]>()
    for (const item of [...rigs, ...servers]) {
      if (!item.gridPosition) continue
      const key = `${item.chassis ?? 'rack-basic'}:${'chip' in item ? item.chip : 'empty'}`
      batches.set(key, [...(batches.get(key) ?? []), item])
    }
    const matrix = new THREE.Matrix4(), translation = new THREE.Matrix4()
    for (const items of batches.values()) {
      const first = items[0], template = this.templates.get(first.chassis ?? 'rack-basic')
      if (!template) continue
      template.updateMatrixWorld(true)
      template.traverse(source => {
        if (!(source instanceof THREE.Mesh)) return
        let ancestor: THREE.Object3D | null = source
        while (ancestor) {
          if (ancestor.name === 'compute_modules' && !('chip' in first)) return
          ancestor = ancestor.parent
        }
        const tint = (original: THREE.Material) => {
          const material = original.clone(); this.materials.add(material)
          if (material instanceof THREE.MeshStandardMaterial && material.name === 'chip_indicator') {
            const color = efficiency < 1 ? '#e39c5e' : 'chip' in first && first.chip === 'flagship' ? '#c498ed' : 'chip' in first && first.chip === 'accelerator' ? '#67c6ef' : '#75d6b9'
            material.color.set(color); material.emissive.set(color); material.emissiveIntensity = .8
          }
          return material
        }
        const mesh = new THREE.InstancedMesh(source.geometry, Array.isArray(source.material) ? source.material.map(tint) : tint(source.material), items.length)
        mesh.castShadow = true; mesh.receiveShadow = true
        mesh.userData.cells = items.map(item => item.gridPosition)
        items.forEach((item, index) => {
          const p = cellWorld(this.grid, item.gridPosition!, .04)
          translation.makeTranslation(p.x, p.y, p.z); matrix.multiplyMatrices(translation, source.matrixWorld)
          mesh.setMatrixAt(index, matrix)
        })
        mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); this.equipment.add(mesh)
      })
    }
    this.resize()
  }
  focusSelected() { if (this.selected) { this.focused = !this.focused; this.resize() } }
  private resize() {
    if (this.disposed) return
    const width = Math.max(this.host.clientWidth, 1), height = Math.max(this.host.clientHeight, 1)
    this.renderer.setSize(width, height)
    const roomWidth = Math.max(6.6, this.grid.cols * 1.3 + 3.1)
    const depth = Math.max(6, (this.grid.rows - 1) * ROW_SPACING + 3.6)
    const half = Math.max((depth * Math.sin(ELEVATION) + 3.8) / 2, (roomWidth + depth * .18 + 1.5) / 2 * height / width)
    const target = this.focused && this.selected ? cellWorld(this.grid, this.selected, .5) : new THREE.Vector3(0, 1, 0)
    this.camera.position.copy(target).add(new THREE.Vector3(6, 30 * Math.tan(ELEVATION), 29.4))
    this.camera.lookAt(target)
    this.camera.zoom = this.focused ? 1.8 : 1
    this.camera.left = -half * width / height; this.camera.right = half * width / height; this.camera.top = half; this.camera.bottom = -half
    this.camera.updateProjectionMatrix(); this.camera.updateMatrixWorld()
    const cells: CellProjection[] = [], unit = width / (this.camera.right - this.camera.left) * this.camera.zoom
    for (let row = 0; row < this.grid.rows; row++) for (let col = 0; col < this.grid.cols; col++) {
      // Compact labels sit in the aisle, never on top of a rack hit target.
      const p = cellWorld(this.grid, { row, col }, .05); p.z += .84; p.project(this.camera)
      cells.push({ row, col, x: (p.x + 1) * width / 2, y: (1 - p.y) * height / 2, size: unit * .85, height: Math.max(14, unit * .25) })
    }
    this.onProject(cells); this.render()
  }
  private render() { if (!this.disposed) { this.renderer.render(this.scene, this.camera); this.host.dataset.drawCalls = String(this.renderer.info.render.calls); this.host.dataset.triangles = String(this.renderer.info.render.triangles) } }
  private visible = () => { if (!document.hidden) this.render() }
  private click = (event: PointerEvent) => {
    if (event.button !== 0 || this.locationId === 'hq') return
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), this.camera)
    const hit = this.raycaster.intersectObject(this.equipment, true)[0]
    if (hit?.instanceId !== undefined) { this.onSelect(hit.object.userData.cells[hit.instanceId] as GridPosition); return }
    const point = this.raycaster.ray.intersectPlane(this.plane, new THREE.Vector3())
    this.onSelect(point ? floorCell(this.grid, point) : null)
  }
  private disposeAsset(asset: THREE.Object3D) {
    asset.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose() } })
  }
  destroy() {
    if (this.disposed) return
    this.disposed = true; this.observer.disconnect()
    document.removeEventListener('visibilitychange', this.visible)
    this.renderer.domElement.removeEventListener('pointerup', this.click)
    this.equipment.children.forEach(o => { if (o instanceof THREE.InstancedMesh) o.dispose() })
    this.scene.traverse(o => { if (o instanceof THREE.DirectionalLight) o.shadow.dispose() })
    this.assets.forEach(a => this.disposeAsset(a)); this.materials.forEach(m => m.dispose())
    this.renderer.dispose(); this.renderer.forceContextLoss(); this.renderer.domElement.remove()
  }
}
