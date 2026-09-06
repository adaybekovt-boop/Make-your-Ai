import type { ChipId, LocationState } from './types'

export function installedChips(location: LocationState): ChipId[] {
  return [
    ...Array<ChipId>(location.servers).fill('consumer-gpu'),
    ...(location.racks ?? []).flatMap((rack) => Array<ChipId>(rack.count).fill(rack.chip)),
  ]
}
