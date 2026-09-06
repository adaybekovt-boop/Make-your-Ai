import type { OrbitControls } from 'three/addons/controls/OrbitControls.js'

export function configureMapPanning(controls: OrbitControls) {
  // Map bounds constrain the target to ground level, so panning must use that same plane.
  controls.screenSpacePanning = false
}
