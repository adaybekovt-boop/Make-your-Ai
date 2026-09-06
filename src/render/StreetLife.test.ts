import { describe, expect, it } from 'vitest'
import { routePosition } from './StreetLife'

const route = [[0, 10, 0], [100, 10, 0], [100, 10, 100], [0, 10, 100], [0, 10, 0]]

describe('Blender-authored street route playback', () => {
  it('moves along connected road segments and loops without teleporting across a block', () => {
    expect(routePosition(route, 50)).toMatchObject({ x: 50, y: 10, z: 0 })
    expect(routePosition(route, 150)).toMatchObject({ x: 100, y: 10, z: 50 })
    expect(routePosition(route, 450)).toEqual(routePosition(route, 50))
  })
  it('supports offsets and degenerate points safely', () => {
    expect(routePosition(route, -50)).toMatchObject({ x: 0, z: 50 })
    expect(routePosition([[0, 0, 0], [0, 0, 0]], 20)).toEqual({ x: 0, y: 0, z: 0, angle: 0 })
  })
})

import * as THREE from 'three'
import { gaitAngle, StreetLife } from './StreetLife'

describe('articulated crowd batching', () => {
  it('keeps the rare coupe out of normal traffic and preserves its gate during zoom changes', () => {
    const city = new THREE.Group()
    for (let i = 0; i < 2; i++) {
      const template = new THREE.Group(); template.name = `actor_car_${i}`; template.userData.rare = i === 1
      template.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial())); city.add(template)
    }
    const life = new StreetLife(city, [{ kind: 'car', points: [[0, 0, 0], [100, 0, 0]], count: 8, speed: 10 }], 100)
    const [regular, rare] = life.group.children as THREE.InstancedMesh[]
    expect(regular.count).toBe(8); expect(rare.count).toBe(1)
    expect(rare.visible).toBe(false)
    life.setDetail(4); expect(rare.visible).toBe(false)
    life.setRareCar(true); life.setDetail(1); expect(rare.visible).toBe(true)
    life.setRareCar(false); expect(rare.visible).toBe(false)
    life.dispose()
    city.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose() } })
  })
  it('uses alternating arms/legs and bends knees only forward', () => {
    expect(gaitAngle('leg_l', Math.PI / 2)).toBeLessThan(0)
    expect(gaitAngle('leg_r', Math.PI / 2)).toBeGreaterThan(0)
    expect(gaitAngle('arm_l', Math.PI / 2)).toBeGreaterThan(0)
    expect(gaitAngle('knee_l', Math.PI / 2)).toBeGreaterThan(0)
    expect(gaitAngle('knee_l', -Math.PI / 2)).toBe(0)
    expect(gaitAngle('body', Math.PI / 2)).toBe(0)
  })
  it('batches the same model across routes, preserves joint pivots and skips distant people', () => {
    const city = new THREE.Group()
    const template = new THREE.Group(); template.name = 'actor_person_0'; city.add(template)
    const leg = new THREE.Group(); leg.name = 'leg_l'; leg.userData.joint = 'leg_l'; leg.position.y = .15; template.add(leg)
    const source = new THREE.Mesh(new THREE.BoxGeometry(.03, .1, .03), new THREE.MeshStandardMaterial()); source.position.y = -.05; leg.add(source)
    const r = { kind: 'person' as const, points: [[0, 0, 0], [100, 0, 0]] as [number, number, number][], count: 6, speed: 14 }
    const life = new StreetLife(city, [r, r], 100)
    expect(life.group.children).toHaveLength(1)
    const mesh = life.group.children[0] as THREE.InstancedMesh
    expect(mesh.count).toBe(12)
    const a = new THREE.Matrix4(), b = new THREE.Matrix4(); mesh.getMatrixAt(0, a)
    life.update(.25); mesh.getMatrixAt(0, b)
    expect(a.equals(b)).toBe(false)
    expect(template.visible).toBe(false)
    life.setDetail(1); expect(mesh.visible).toBe(false)
    life.setDetail(4); expect(mesh.visible).toBe(true)
    life.dispose(); source.geometry.dispose(); (source.material as THREE.Material).dispose()
  })
})
