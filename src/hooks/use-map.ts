import { useEffect, useState } from 'react'
import type { Map } from 'maplibre-gl'

type MapState = {
  map: Map | null
  isLoaded: boolean
  error: Error | null
}

let mapInstance: Map | null = null

export function useMap() {
  const [mapState, setMapState] = useState<MapState>({
    map: null,
    isLoaded: false,
    error: null
  })

  useEffect(() => {
    let mounted = true
    let attempts = 0
    const MAX_ATTEMPTS = 50 // 5 seconds total

    // Wait for the map to be initialized
    const checkMap = () => {
      if (!mounted) return

      if (mapInstance) {
        setMapState({
          map: mapInstance,
          isLoaded: true,
          error: null
        })
      } else {
        attempts++
        if (attempts >= MAX_ATTEMPTS) {
          setMapState(prev => ({
            ...prev,
            error: new Error('Map failed to initialize after 5 seconds')
          }))
        } else {
          setTimeout(checkMap, 100)
        }
      }
    }
    
    checkMap()

    return () => {
      mounted = false
    }
  }, [])

  return mapState
}

// Export a function to set the map instance from the MapController
export function setMapInstance(map: Map | null) {
  mapInstance = map
} 