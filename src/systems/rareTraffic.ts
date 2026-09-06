/** One independent roll at each crossed six-hour boundary; first roll is at hour 6. */
export function rareCarArrival(before: number, after: number, random: () => number): number | undefined {
  let until: number | undefined
  for (let interval = Math.floor(before / 6) + 1; interval <= Math.floor(after / 6); interval++) {
    if (random() < .1) until = interval * 6 + 1
  }
  return until
}
