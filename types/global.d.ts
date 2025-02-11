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
      top: number
      left: number
      bottom: number
      right: number
    }>
  }
}