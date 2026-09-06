import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { loadCityBackdrop, type CityManifest, type CityManifestEntry } from './CityBackdrop'
import { StreetLife } from './StreetLife'
import { configureMapPanning } from './mapNavigation'
import { calculateLocationEconomy } from '../systems/economy'
import type { GameState } from '../systems/types'
import type { BuildingProjection, MapObjectId, MapProjection } from './mapPresentation'

interface MapNode {
  entry: CityManifestEntry
  object: THREE.Object3D
  materials: { material: THREE.MeshStandardMaterial; color: THREE.Color; emissive: THREE.Color; intensity: number }[]
  corners: THREE.Vector3[]
  roof: THREE.Vector3
  anchor: THREE.Vector3
  signature: string
}

const VIEW = new THREE.Vector3(8500, 10000, 12500)

export class RegionMap {
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.OrthographicCamera(-7000, 7000, 5000, -5000, 1, 60000)
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  private readonly controls: OrbitControls
  private readonly nodes: MapNode[] = []
  private readonly pickables: THREE.Object3D[] = []
  private readonly raycaster = new THREE.Raycaster()
  private readonly sky = new THREE.HemisphereLight(0xdce8ed, 0x536d53, 2)
  private readonly sun = new THREE.DirectionalLight(0xffecd5, 2.5)
  private readonly navigation = document.createElement('div')
  private readonly cityLights = new Set<THREE.MeshStandardMaterial>()
  private readonly streetLamps: THREE.PointLight[] = []
  private manifest: CityManifest | null = null
  private life: StreetLife | null = null
  private observer: ResizeObserver | null = null
  private disposed = false
  private frame = 0
  private previousTime = 0
  private dirty = true
  private projectDirty = true
  private animate = true
  private lastProjection = ''
  private lightSignature = ''
  private renders = 0
  private fpsFrames = 0
  private fpsStart = 0
  private pixelRatio = Math.min(window.devicePixelRatio || 1, 1.25)
  private press: { x: number; y: number; id: number; moved: boolean } | null = null
  private readonly pointers = new Set<number>()
  private readonly motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')

  private constructor(private readonly host: HTMLElement, private readonly onSelect: (id: MapObjectId | null) => void, private readonly onProject: (projection: MapProjection) => void) {
    this.renderer.setPixelRatio(this.pixelRatio)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.shadowMap.autoUpdate = false
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.1
    this.scene.background = new THREE.Color(0x394a4d)
    this.scene.fog = new THREE.Fog(0x394a4d, 17500, 34000)
    this.scene.add(this.sky, this.sun, this.sun.target)
    this.sun.position.set(-5000, 11000, 4000)
    this.sun.target.position.set(400, 0, 0)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    Object.assign(this.sun.shadow.camera, { left: -6500, right: 6500, top: 6500, bottom: -6500, near: 1, far: 30000 })
    this.sun.shadow.normalBias = 2
    this.camera.position.copy(VIEW).add(new THREE.Vector3(500, 0, 0))
    this.camera.lookAt(500, 0, 0)
    const canvas = this.renderer.domElement
    canvas.style.touchAction = 'none'
    canvas.style.cursor = 'grab'
    canvas.addEventListener('pointerdown', this.pointerDown)
    canvas.addEventListener('pointermove', this.pointerMove)
    canvas.addEventListener('pointerup', this.pointerUp)
    canvas.addEventListener('pointercancel', this.pointerCancel)
    canvas.addEventListener('lostpointercapture', this.pointerCancel)
    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.target.set(500, 0, 0)
    this.controls.enableRotate = false
    this.controls.enableDamping = true
    this.controls.dampingFactor = .18
    configureMapPanning(this.controls)
    this.controls.zoomToCursor = true
    this.controls.minZoom = .65
    this.controls.maxZoom = 22
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }
    this.controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN }
    this.controls.addEventListener('change', this.onCameraChange)
    host.append(canvas)
    this.navigation.className = 'city-navigation'
    this.navigation.setAttribute('aria-label', 'Навигация по городу')
    for (const [label, action] of [
      ['Весь город', () => this.resetView()],
      ['Мой технопарк', () => this.focusLocations()],
      ['Дата-центры', () => this.focusArea(new THREE.Vector3(3500, 0, 0), 2.7)],
      ['Магазины чипов', () => this.focusArea(new THREE.Vector3(0, 0, 0), 5)],
      ['Деловой район', () => this.focusArea(new THREE.Vector3(250, 0, -1200), 4)],
    ] as const) {
      const button = document.createElement('button')
      button.type = 'button'; button.textContent = label
      button.addEventListener('click', () => { this.onSelect(null); action() })
      this.navigation.append(button)
    }
    host.append(this.navigation)
    document.addEventListener('visibilitychange', this.onVisibility)
    this.motionPreference.addEventListener('change', this.onCameraChange)
  }

  static async create(host: HTMLElement, onSelect: (id: MapObjectId | null) => void, onProject: (projection: MapProjection) => void): Promise<RegionMap> {
    const instance = new RegionMap(host, onSelect, onProject)
    try {
      const { city, manifest } = await loadCityBackdrop()
      instance.manifest = manifest
      instance.scene.add(city)
      for (const position of manifest.streetLamps ?? []) {
        const lamp = new THREE.PointLight(0xffb65a, 0, 230, 1.5)
        lamp.position.set(...position); instance.streetLamps.push(lamp); instance.scene.add(lamp)
      }
      city.updateMatrixWorld(true)
      instance.prepareNodes(city, manifest)
      city.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          if (material instanceof THREE.MeshStandardMaterial && material.name.includes('illumination')) instance.cityLights.add(material)
        }
      })
      instance.life = new StreetLife(city, manifest.routes, manifest.scale)
      instance.scene.add(instance.life.group)
      instance.renderer.shadowMap.needsUpdate = true
      instance.host.dataset.city = 'living-metropolis-blender'
      instance.host.dataset.actorCount = String(manifest.actors)
      instance.observer = new ResizeObserver(() => instance.resize())
      instance.observer.observe(host)
      instance.resize()
      instance.focusLocations()
      // Render the first frame even if the host temporarily suppresses animation callbacks.
      cancelAnimationFrame(instance.frame)
      instance.frame = 0
      instance.draw(performance.now(), true)
      return instance
    } catch (error) { instance.destroy(); throw error }
  }

  private prepareNodes(city: THREE.Group, manifest: CityManifest) {
    for (const entry of manifest.objects) {
      const object = city.getObjectByName(entry.node)
      if (!object) throw new Error(`В модели отсутствует объект ${entry.node}`)
      const materials: MapNode['materials'] = []
      object.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return
        child.userData.mapId = entry.id
        this.pickables.push(child)
        const clone = (source: THREE.Material) => {
          const material = source.clone()
          if (material instanceof THREE.MeshStandardMaterial) materials.push({ material, color: material.color.clone(), emissive: material.emissive.clone(), intensity: material.emissiveIntensity })
          return material
        }
        child.material = Array.isArray(child.material) ? child.material.map(clone) : clone(child.material)
      })
      const [minX, minY, minZ] = entry.min, [maxX, maxY, maxZ] = entry.max
      const corners = [minX, maxX].flatMap((x) => [minY, maxY].flatMap((y) => [minZ, maxZ].map((z) => new THREE.Vector3(x, y, z))))
      this.nodes.push({ entry, object, materials, corners, roof: new THREE.Vector3(...entry.roof), anchor: new THREE.Vector3((minX + maxX) / 2, minY + 15, maxZ + 25), signature: '' })
    }
  }

  update(game: GameState, selectedId: MapObjectId | null) {
    if (this.disposed) return
    this.animate = !game.paused && !game.ending
    this.life?.setRareCar((game.rareCarUntil ?? 0) > game.elapsedGameHours)
    const hour = (game.elapsedGameHours + 8) % 24
    const daylight = THREE.MathUtils.smoothstep(hour, 5, 8) * (1 - THREE.MathUtils.smoothstep(hour, 17, 20))
    const signature = daylight.toFixed(2)
    if (signature !== this.lightSignature) {
      this.lightSignature = signature
      this.sky.intensity = THREE.MathUtils.lerp(.65, 1.65, daylight)
      this.sun.intensity = THREE.MathUtils.lerp(.35, 2.8, daylight)
      this.sun.color.set(0x87a6ca).lerp(new THREE.Color(0xffecd5), daylight)
      ;(this.scene.background as THREE.Color).set(0x172731).lerp(new THREE.Color(0x394a4d), daylight)
      this.cityLights.forEach((material) => { material.emissiveIntensity = (1 - daylight) * 2.1 + .04 })
      this.streetLamps.forEach(lamp => { lamp.intensity = (1 - daylight) * 1400 })
      ;(this.scene.fog as THREE.Fog).color.copy(this.scene.background as THREE.Color)
      this.host.dataset.lighting = daylight > .5 ? 'day' : 'night'
      this.dirty = true
    }
    for (const node of this.nodes) {
      const location = game.locations.find((item) => item.id === node.entry.id)
      const owned = node.entry.kind === 'tower' ? (game.cityProperties ?? []).some((id) => id === node.entry.id) : !!location?.owned
      const overload = location?.owned ? calculateLocationEconomy(location).efficiency < 1 : false
      const selected = node.entry.id === selectedId
      const key = `${owned}-${overload}-${selected}`
      if (key === node.signature) continue
      node.signature = key
      for (const { material, color, emissive, intensity } of node.materials) {
        material.color.copy(color)
        material.emissive.copy(emissive)
        material.emissiveIntensity = intensity
        if (selected || owned || overload) {
          material.emissive.set(overload ? 0xb9a892 : selected ? 0xacc98a : 0x647c4e)
          material.emissiveIntensity = selected ? .23 : .1
        }
      }
      this.dirty = true
    }
    this.schedule()
  }

  private resize() {
    if (this.disposed) return
    const width = Math.max(this.host.clientWidth, 1), height = Math.max(this.host.clientHeight, 1)
    this.renderer.setSize(width, height)
    const halfHeight = Math.max(3800, 5200 * height / width)
    this.camera.left = -halfHeight * width / height; this.camera.right = halfHeight * width / height
    this.camera.top = halfHeight; this.camera.bottom = -halfHeight
    this.camera.updateProjectionMatrix()
    this.onCameraChange()
  }

  resetView() { this.focusArea(new THREE.Vector3(500, 0, 0), 1.22) }
  focusLocations() { this.focusArea(new THREE.Vector3(...(this.manifest?.campusCenter ?? [3550, 0, 0])), 8) }
  private focusArea(center: THREE.Vector3, zoom: number) {
    if (this.disposed) return
    this.controls.target.copy(center)
    this.camera.position.copy(center).add(VIEW)
    this.camera.zoom = zoom
    this.camera.updateProjectionMatrix()
    this.controls.update()
    this.onCameraChange()
  }
  zoomBy(factor: number) {
    if (this.disposed || !Number.isFinite(factor) || factor <= 0) return
    this.camera.zoom = THREE.MathUtils.clamp(this.camera.zoom * factor, this.controls.minZoom, this.controls.maxZoom)
    this.camera.updateProjectionMatrix()
    this.onCameraChange()
  }

  private onCameraChange = () => { this.dirty = true; this.projectDirty = true; this.schedule() }
  private onVisibility = () => {
    if (document.hidden) { cancelAnimationFrame(this.frame); this.frame = 0; this.previousTime = 0 }
    else this.onCameraChange()
  }
  private schedule() { if (!this.disposed && !this.frame && !document.hidden) this.frame = requestAnimationFrame(this.draw) }
  private draw = (time: number, force = false) => {
    this.frame = 0
    if (this.disposed || (document.hidden && !force)) return
    const delta = this.previousTime ? Math.min((time - this.previousTime) / 1000, .05) : 0
    this.previousTime = time
    this.controls.update()
    const moving = this.animate && !this.motionPreference.matches
    this.life?.setDetail(this.camera.zoom)
    if (moving) this.life?.update(delta)
    if (this.dirty || moving) {
      const bounds = this.manifest?.bounds ?? [-3900, -3700, 4900, 3300]
      const clamped = this.controls.target.clone().clamp(new THREE.Vector3(bounds[0], 0, bounds[1]), new THREE.Vector3(bounds[2], 0, bounds[3]))
      this.camera.position.add(clamped.clone().sub(this.controls.target)); this.controls.target.copy(clamped)
      this.renderer.render(this.scene, this.camera)
      this.host.dataset.drawCalls = String(this.renderer.info.render.calls)
      this.host.dataset.triangles = String(this.renderer.info.render.triangles)
      this.host.dataset.renderCount = String(++this.renders)
      if (this.projectDirty) this.projectObjects()
      this.dirty = false
      this.fpsFrames++
      if (!this.fpsStart) this.fpsStart = time
      if (time - this.fpsStart >= 2000) {
        const fps = this.fpsFrames * 1000 / (time - this.fpsStart)
        this.host.dataset.fps = fps.toFixed(1)
        if (moving && fps < 38 && this.pixelRatio > .85) { this.pixelRatio = Math.max(.85, this.pixelRatio - .15); this.renderer.setPixelRatio(this.pixelRatio); this.dirty = true }
        this.host.dataset.pixelRatio = String(this.pixelRatio)
        this.fpsFrames = 0; this.fpsStart = time
      }
    }
    if (moving || this.dirty) this.schedule()
    else this.previousTime = 0
  }

  private projectObjects() {
    this.projectDirty = false
    const width = this.host.clientWidth, height = this.host.clientHeight
    const project = (point: THREE.Vector3) => { const p = point.clone().project(this.camera); return { x: Math.round((p.x + 1) * width / 2 * 10) / 10, y: Math.round((1 - p.y) * height / 2 * 10) / 10 } }
    const buildings: BuildingProjection[] = this.nodes.map((node) => {
      const corners = node.corners.map(project)
      const minX = Math.min(...corners.map((p) => p.x)), maxX = Math.max(...corners.map((p) => p.x))
      const minY = Math.min(...corners.map((p) => p.y)), maxY = Math.max(...corners.map((p) => p.y))
      const roof = project(node.roof)
      return { id: node.entry.id, roof, label: project(node.anchor), warning: { x: minX - 8, y: minY - 22 }, bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY }, visible: (node.entry.kind !== 'location' || this.camera.zoom >= 1.8) && roof.x > 0 && roof.x < width && roof.y > 0 && roof.y < height }
    })
    const next = { width, height, buildings }
    const signature = JSON.stringify(next)
    if (signature !== this.lastProjection) { this.lastProjection = signature; this.onProject(next) }
  }

  private pointerDown = (event: PointerEvent) => {
    this.pointers.add(event.pointerId)
    if (this.pointers.size > 1) { if (this.press) this.press.moved = true; return }
    if (event.button !== 0) return
    this.press = { x: event.clientX, y: event.clientY, id: event.pointerId, moved: false }
    this.renderer.domElement.style.cursor = 'grabbing'
  }
  private pointerMove = (event: PointerEvent) => { if (this.press && Math.hypot(event.clientX - this.press.x, event.clientY - this.press.y) > 5) this.press.moved = true }
  private pointerUp = (event: PointerEvent) => {
    const press = this.press
    if (press?.id === event.pointerId && !press.moved && Math.hypot(event.clientX - press.x, event.clientY - press.y) <= 5) {
      const rect = this.renderer.domElement.getBoundingClientRect()
      this.raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), this.camera)
      const hit = this.raycaster.intersectObjects(this.pickables, false)[0]
      this.onSelect(hit ? hit.object.userData.mapId as MapObjectId : null)
    }
    this.pointerCancel(event)
  }
  private pointerCancel = (event: PointerEvent) => { this.pointers.delete(event.pointerId); if (this.press?.id === event.pointerId) this.press = null; this.renderer.domElement.style.cursor = 'grab' }

  destroy() {
    if (this.disposed) return
    this.disposed = true
    this.observer?.disconnect(); cancelAnimationFrame(this.frame)
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.motionPreference.removeEventListener('change', this.onCameraChange)
    this.controls.removeEventListener('change', this.onCameraChange); this.controls.dispose()
    this.navigation.remove(); this.life?.dispose()
    const canvas = this.renderer.domElement
    canvas.removeEventListener('pointerdown', this.pointerDown); canvas.removeEventListener('pointermove', this.pointerMove); canvas.removeEventListener('pointerup', this.pointerUp); canvas.removeEventListener('pointercancel', this.pointerCancel); canvas.removeEventListener('lostpointercapture', this.pointerCancel)
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>()
    this.scene.traverse((object) => { if (object instanceof THREE.Mesh || object instanceof THREE.Line) { geometries.add(object.geometry); for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material) } })
    geometries.forEach((geometry) => geometry.dispose()); materials.forEach((material) => material.dispose())
    this.sun.shadow.dispose(); this.renderer.dispose(); this.renderer.forceContextLoss(); canvas.remove()
  }
}
