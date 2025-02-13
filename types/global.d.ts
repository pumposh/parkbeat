export {}

// Create a type for the roles
export type Roles = 'treeCareCaptain' | 'member'

declare global {
  interface CustomJwtSessionClaims {
    metadata: {
      role?: Roles
    }
  }
}

declare global {
  interface WindowEventMap {
    'map:newBounds': CustomEvent<{
      north: number
      south: number
      east: number
      west: number
    }>
  }
}

declare global {
  interface Window {
    mapBounds?: {
      north: number
      south: number
      east: number
      west: number
    }
    currentGeohash?: string
  }
}