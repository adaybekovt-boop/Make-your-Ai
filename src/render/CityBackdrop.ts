import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import type { CityObjectId } from '../systems/city'
import type { LocationId } from '../systems/types'

export interface CityManifestEntry {
  id: LocationId | CityObjectId
  kind: 'location' | 'tower' | 'shop'
  node: string
  min: [number, number, number]
  max: [number, number, number]
  roof: [number, number, number]
}
export interface StreetRoute {
  kind: 'car' | 'person' | 'dog'
  points: [number, number, number][]
  count: number
  speed: number
}
export interface CityManifest {
  scale: number
  campusCenter: [number, number, number]
  cityCenter: [number, number, number]
  objects: CityManifestEntry[]
  routes: StreetRoute[]
  actors: number
  optimizedObjects: number
  webBatches: number
}

/** The complete environment and actor meshes are exported from Metropolis_Living_v2.blend. */
export async function loadCityBackdrop(signal?: AbortSignal): Promise<{ city: THREE.Group; manifest: CityManifest }> {
  const decoder = new DRACOLoader()
  decoder.setDecoderPath(`${import.meta.env.BASE_URL}models/metropolis/draco/`)
  decoder.setWorkerLimit(1)
  const loader = new GLTFLoader().setDRACOLoader(decoder)
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  const timeout = window.setTimeout(abort, 45_000)
  try {
    if (signal?.aborted) throw new DOMException('Загрузка отменена', 'AbortError')
    const base = `${import.meta.env.BASE_URL}models/living-city/`
    const [modelResponse, manifestResponse] = await Promise.all([
      fetch(`${base}living-city.glb`, { signal: controller.signal }),
      fetch(`${base}manifest.json`, { signal: controller.signal }),
    ])
    if (!modelResponse.ok || !manifestResponse.ok) throw new Error('Не удалось загрузить сцену города. Попробуйте обновить страницу.')
    const manifest = await manifestResponse.json() as CityManifest
    if (!Array.isArray(manifest.objects) || !Array.isArray(manifest.routes) || manifest.scale !== 100) throw new Error('Описание сцены города повреждено.')
    const gltf = await loader.parseAsync(await modelResponse.arrayBuffer(), '')
    const city = gltf.scene
    city.scale.setScalar(manifest.scale)
    city.name = 'Living metropolis / Blender scene'
    city.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      object.castShadow = true
      object.receiveShadow = true
      if (!object.geometry.boundingSphere) object.geometry.computeBoundingSphere()
      object.updateMatrix()
      object.matrixAutoUpdate = false
    })
    return { city, manifest }
  } finally {
    window.clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
    decoder.dispose()
  }
}
