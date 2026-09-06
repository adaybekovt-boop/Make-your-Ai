import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { cellWorld, ELEVATION, floorCell } from './interiorLayout'

describe('fixed low-angle interior picking', () => {
  for (const n of [3, 4, 5, 6, 8]) for (const aspect of [1.5, .65]) for (const zoom of [1, 1.8]) {
    it(`round-trips every floor tile: ${n}x${n}, aspect ${aspect}, zoom ${zoom}`, () => {
      const grid = { rows: n, cols: n }
      const camera = new THREE.OrthographicCamera(-20 * aspect, 20 * aspect, 20, -20, .1, 150)
      camera.position.set(0, 30 * Math.tan(ELEVATION) + 1, 30); camera.lookAt(0, 1, 0)
      camera.zoom = zoom; camera.updateProjectionMatrix(); camera.updateMatrixWorld()
      const raycaster = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
      for (let row = 0; row < n; row++) for (let col = 0; col < n; col++) {
        const screen = cellWorld(grid, { row, col }).project(camera)
        raycaster.setFromCamera(new THREE.Vector2(screen.x, screen.y), camera)
        const intersection = raycaster.ray.intersectPlane(plane, new THREE.Vector3())!
        expect(floorCell(grid, intersection)).toEqual({ row, col })
      }
    })
  }
  it('does not select cells through aisles or outside the room', () => {
    const grid = { rows: 3, cols: 3 }
    expect(floorCell(grid, new THREE.Vector3(0, 0, 1.4))).toBeNull()
    expect(floorCell(grid, new THREE.Vector3(20, 0, 0))).toBeNull()
    expect(floorCell(grid, new THREE.Vector3(.63, 0, 0))).toBeNull()
  })
})
