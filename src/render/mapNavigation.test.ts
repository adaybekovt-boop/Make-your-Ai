import { expect, it } from 'vitest'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { configureMapPanning } from './mapNavigation'

it.each([1.22, 8, 22])('pans vertically in both directions without changing height at zoom %s', zoom => {
  const camera = new THREE.OrthographicCamera(-7000, 7000, 5000, -5000, 1, 60000)
  camera.position.set(8500, 10000, 12500)
  camera.zoom = zoom
  camera.updateProjectionMatrix()
  const controls = new OrbitControls(camera)
  // Geometry-only test: no browser, event dispatch, or interaction with the running game.
  controls.domElement = { clientWidth: 1400, clientHeight: 1000 } as HTMLElement
  configureMapPanning(controls)
  controls.update()
  const before = new THREE.Vector3().project(camera)
  const height = camera.position.y
  controls.pan(0, 100)
  const after = new THREE.Vector3().project(camera)
  expect(Math.abs(after.y - before.y)).toBeGreaterThan(.01)
  expect(after.x).toBeCloseTo(before.x)
  expect(controls.target.y).toBeCloseTo(0)
  expect(camera.position.y).toBeCloseTo(height)
  const target = controls.target.clone()
  expect(target.clone().clamp(new THREE.Vector3(-3900, 0, -3700), new THREE.Vector3(4900, 0, 3300)).distanceTo(target)).toBeCloseTo(0)
  controls.pan(0, -200)
  expect(controls.target.dot(target)).toBeLessThan(0)
  controls.pan(0, 100)
  expect(controls.target.length()).toBeCloseTo(0)
})
