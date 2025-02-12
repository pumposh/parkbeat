import geohash from 'ngeohash'

interface CardinalBounds {
  north: number,
  south: number,
  east: number,
  west: number
}

/**
 * Finds the most precise geohash that encompasses the given bounds
 */
export function boundsToGeohash(bounds: CardinalBounds): string {
  // Get geohashes for all four corners
  const nw = geohash.encode(bounds.north, bounds.west)
  const ne = geohash.encode(bounds.north, bounds.east)
  const sw = geohash.encode(bounds.south, bounds.west)
  const se = geohash.encode(bounds.south, bounds.east)

  // Find the common prefix length between all corners
  let commonLength = 0
  while (commonLength < Math.min(nw.length, ne.length, sw.length, se.length)) {
    const char = nw[commonLength]
    if (
      char === ne[commonLength] &&
      char === sw[commonLength] &&
      char === se[commonLength]
    ) {
      commonLength++
    } else {
      break
    }
  }

  // Get the common prefix
  const commonPrefix = nw.slice(0, commonLength)
  return commonPrefix
}
