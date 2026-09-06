import * as THREE from 'three'
import type { StreetRoute } from './CityBackdrop'

export function routePosition(points: readonly (readonly number[])[], distance: number) {
  const lengths = points.slice(1).map((point, index) => Math.hypot(point[0] - points[index][0], point[2] - points[index][2]))
  const total = lengths.reduce((sum, value) => sum + value, 0)
  if (!total) return { x: points[0]?.[0] ?? 0, y: points[0]?.[1] ?? 0, z: points[0]?.[2] ?? 0, angle: 0 }
  let remaining = ((distance % total) + total) % total
  for (let index = 0; index < lengths.length; index++) {
    const length = lengths[index]
    if (!length) continue
    if (remaining <= length) {
      const a = points[index], b = points[index + 1]
      const t = remaining / length
      return { x: a[0] + (b[0] - a[0]) * t, y: a[1], z: a[2] + (b[2] - a[2]) * t, angle: Math.atan2(b[0] - a[0], b[2] - a[2]) }
    }
    remaining -= length
  }
  return { x: points[0][0], y: points[0][1], z: points[0][2], angle: 0 }
}

export class StreetLife {
  readonly group = new THREE.Group()
  private readonly batches: { mesh: THREE.InstancedMesh; route: StreetRoute; length: number }[] = []
  private readonly dummy = new THREE.Object3D()
  private time = 0

  constructor(city: THREE.Group, routes: StreetRoute[], scale: number) {
    this.group.name = 'Blender street actors / instanced'
    for (const route of routes) {
      const template = city.getObjectByName(`actor_${route.kind}`)
      const source = template instanceof THREE.Mesh ? template : template?.children.find((object) => object instanceof THREE.Mesh)
      if (!(source instanceof THREE.Mesh)) continue
      template!.visible = false
      const material = (Array.isArray(source.material) ? source.material[0] : source.material).clone()
      const mesh = new THREE.InstancedMesh(source.geometry, material, route.count)
      mesh.name = `Moving ${route.kind}`
      mesh.castShadow = false
      mesh.receiveShadow = false
      // Routes span multiple city blocks; this tiny batch is cheaper than per-actor culling.
      mesh.frustumCulled = false
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      this.group.add(mesh)
      this.batches.push({ mesh, route, length: route.points.slice(1).reduce((sum, point, index) => sum + Math.hypot(point[0] - route.points[index][0], point[2] - route.points[index][2]), 0) })
      for (let index = 0; index < route.count; index++) mesh.setColorAt(index, new THREE.Color().setHSL((index * .17 + .2) % 1, route.kind === 'car' ? .25 : .18, .65 + index % 3 * .1))
    }
    this.dummy.scale.setScalar(scale)
    this.update(0)
  }

  update(seconds: number) {
    this.time += seconds
    for (const { mesh, route, length } of this.batches) {
      for (let index = 0; index < route.count; index++) {
        const p = routePosition(route.points, length * index / route.count + this.time * route.speed)
        this.dummy.position.set(p.x, p.y, p.z)
        this.dummy.rotation.set(0, p.angle, 0)
        this.dummy.updateMatrix()
        mesh.setMatrixAt(index, this.dummy.matrix)
      }
      mesh.instanceMatrix.needsUpdate = true
    }
  }

  setDetail(zoom: number) {
    for (const { mesh, route } of this.batches) mesh.visible = route.kind === 'car' || zoom >= 2.4
  }

  dispose() {
    for (const { mesh } of this.batches) {
      mesh.dispose()
      ;(mesh.material as THREE.Material).dispose()
    }
  }
}
