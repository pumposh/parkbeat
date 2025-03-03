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

// Import the types from the logger module
import { ParkbeatLogger } from '../src/lib/logger-types';

// Extend the global Console interface to include our custom methods
declare global {
  interface Console {
    /**
     * Create a new log group with the specified ID and title
     * @param id Unique identifier for the group
     * @param title Display title for the group
     * @param collapsed Whether the group should be collapsed by default
     * @returns A GroupLogger instance for the group
     */
    createGroup(id: string, title: string, collapsed?: boolean): ParkbeatLogger.GroupLogger;
    
    /**
     * End a log group with the specified ID
     * @param groupId The ID of the group to end
     */
    endGroup(groupId: string): void;
    
    /**
     * Get a GroupLogger instance for an existing group
     * @param groupId The ID of the group
     * @returns A GroupLogger instance for the group
     */
    getGroup(groupId: string): ParkbeatLogger.GroupLogger;
  }
}