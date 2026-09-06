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
