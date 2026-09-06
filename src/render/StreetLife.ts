import * as THREE from 'three'
import type { StreetRoute } from './CityBackdrop'

function routeLengths(points: readonly (readonly number[])[]) {
  return points.slice(1).map((point, index) => Math.hypot(point[0] - points[index][0], point[2] - points[index][2]))
}
function sampleRoute(points: readonly (readonly number[])[], lengths: number[], total: number, distance: number) {
  if (!total) return { x: points[0]?.[0] ?? 0, y: points[0]?.[1] ?? 0, z: points[0]?.[2] ?? 0, angle: 0 }
  let remaining = ((distance % total) + total) % total
  for (let index = 0; index < lengths.length; index++) {
    const length = lengths[index]
    if (!length) continue
    if (remaining <= length) {
      const a = points[index], b = points[index + 1], t = remaining / length
      return { x: a[0] + (b[0] - a[0]) * t, y: a[1], z: a[2] + (b[2] - a[2]) * t, angle: Math.atan2(b[0] - a[0], b[2] - a[2]) }
    }
    remaining -= length
  }
  return { x: points[0][0], y: points[0][1], z: points[0][2], angle: 0 }
}
export function routePosition(points: readonly (readonly number[])[], distance: number) {
  const lengths = routeLengths(points)
  return sampleRoute(points, lengths, lengths.reduce((sum, value) => sum + value, 0), distance)
}
export function gaitAngle(name: string, phase: number) {
  if (name.startsWith('knee_')) return Math.max(0, -Math.sin(phase) * (name.endsWith('_l') ? -1 : 1)) * .5
  if (!name.startsWith('arm_') && !name.startsWith('leg_')) return 0
  return Math.sin(phase) * (name.startsWith('arm_') ? .32 : .4) * (name === 'arm_l' || name === 'leg_r' ? 1 : -1)
}
interface ActorPart { mesh: THREE.InstancedMesh; chain: { bind: THREE.Matrix4; joint: string }[] }
interface ActorMember { route: StreetRoute; index: number; lengths: number[]; total: number }
interface ActorBatch { parts: ActorPart[]; kind: StreetRoute['kind']; rare: boolean; members: ActorMember[] }
export class StreetLife {
  readonly group = new THREE.Group()
  private readonly batches: ActorBatch[] = []
  private readonly actor = new THREE.Object3D()
  private readonly rotation = new THREE.Matrix4()
  private readonly matrix = new THREE.Matrix4()
  private time = 0
  private accumulator = 0

  constructor(city: THREE.Group, routes: StreetRoute[], scale: number) {
    this.group.name = 'Articulated Blender actors / instanced'
    for (const kind of ['person', 'car', 'dog'] as const) {
      const templates = city.children.filter(o => o.name.startsWith(`actor_${kind}_`))
      if (!templates.length) { const fallback = city.getObjectByName(`actor_${kind}`); if (fallback) templates.push(fallback) }
      const members: ActorMember[] = routes.filter(r => r.kind === kind).flatMap(route => {
        const lengths = routeLengths(route.points), total = lengths.reduce((a, b) => a + b, 0)
        return Array.from({ length: route.count }, (_, index) => ({ route, index, lengths, total }))
      })
      templates.forEach((template, variant) => {
        template.visible = false
        const regular = templates.filter(t => !t.userData.rare)
        const rare = Boolean(template.userData.rare)
        const selected = rare ? members.slice(0, 1) : members.filter((_, index) => index % regular.length === regular.indexOf(template))
        if (!selected.length) return
        const batch: ActorBatch = { parts: [], kind, rare, members: selected }
        template.updateWorldMatrix(true, true)

        template.traverse(source => {
          if (!(source instanceof THREE.Mesh)) return
          const material = Array.isArray(source.material) ? source.material.map(m => m.clone()) : source.material.clone()
          const mesh = new THREE.InstancedMesh(source.geometry, material, selected.length)
          mesh.name = `${kind} ${variant + 1} / ${source.name}`
          mesh.castShadow = false; mesh.receiveShadow = true; mesh.frustumCulled = false
          mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
          const chain: ActorPart['chain'] = []
          let ancestor: THREE.Object3D | null = source
          while (ancestor && ancestor !== template) {
            chain.unshift({ bind: ancestor.matrix.clone(), joint: ancestor.userData.joint ?? ancestor.name })
            ancestor = ancestor.parent
          }
          batch.parts.push({ mesh, chain })
          this.group.add(mesh)
        })
        this.batches.push(batch)
      })
    }
    for (const kind of ['person', 'car', 'dog']) { const legacy = city.getObjectByName(`actor_${kind}`); if (legacy) legacy.visible = false }
    this.actor.scale.setScalar(scale)
    this.update(0, true)
    this.setRareCar(false)
  }
  update(seconds: number, force = false) {
    this.time += seconds; this.accumulator += seconds
    // Animate at 30 Hz; controls/rendering remain responsive independently.
    if (!force && this.accumulator < 1 / 30) return
    this.accumulator = 0
    for (const batch of this.batches) {
      if (!force && !batch.parts.some(p => p.mesh.visible)) continue
      const { parts } = batch
      batch.members.forEach(({ route, lengths, total, index }, instance) => {
        const distance = total * index / route.count + this.time * route.speed
        const p = sampleRoute(route.points, lengths, total, distance)
        this.actor.position.set(p.x, p.y, p.z); this.actor.rotation.set(0, p.angle, 0); this.actor.updateMatrix()
        const phase = distance / 14 * Math.PI * 2
        for (const part of parts) {
          this.matrix.copy(this.actor.matrix)
          for (const segment of part.chain) {
            this.matrix.multiply(segment.bind)
            const angle = route.kind === 'person' ? gaitAngle(segment.joint, phase) : 0
            if (angle) this.matrix.multiply(this.rotation.makeRotationX(angle))
          }
          part.mesh.setMatrixAt(instance, this.matrix)
        }
      })
      for (const part of parts) part.mesh.instanceMatrix.needsUpdate = true
    }
  }
  setRareCar(visible: boolean) {
    for (const batch of this.batches) if (batch.rare) for (const part of batch.parts) part.mesh.visible = visible
  }
  setDetail(zoom: number) {
    for (const batch of this.batches) for (const part of batch.parts) if (!batch.rare) part.mesh.visible = batch.kind === 'car' || zoom >= 2.4
  }
  dispose() {
    for (const batch of this.batches) for (const { mesh } of batch.parts) {
      mesh.dispose()
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) material.dispose()
    }
  }
}
