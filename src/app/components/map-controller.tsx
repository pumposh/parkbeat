'use client'

import { useEffect, useRef, useState } from 'react'
import { useTheme } from 'next-themes'
import maplibregl from 'maplibre-gl'
import { cn } from '@/lib/utils'

interface MapControllerProps {
  initialCenter?: {
    latitude: number
    longitude: number
  }
  initialZoom?: number
  className?: string
}

interface IpLocation {
  latitude: number
  longitude: number
  city: string
}

interface IpApiResponse {
  latitude: number
  longitude: number
  city: string
  error?: boolean
}

const getMapStyle = (theme: string) => {
  let mapStyle = '07c51949-e44b-4615-a124-2b43121fc1d3'
  if (theme === 'dark') {
    mapStyle = '07c51949-e44b-4615-a124-2b43121fc1d3'
  }
  return `https://api.maptiler.com/maps/`
  + `${mapStyle}/style.json`
  + `?key=${process.env.NEXT_PUBLIC_MAPTILER_API_KEY}`
}

async function getIpLocation(defaultLocation: { latitude: number, longitude: number }): Promise<IpLocation> {
  try {
    const response = await fetch('https://ipapi.co/json/')
    const data = await response.json() as IpApiResponse
    
    if (data.error || !data.latitude || !data.longitude || !data.city) {
      throw new Error('Invalid location data')
    }

    return {
      latitude: data.latitude,
      longitude: data.longitude,
      city: data.city
    }
  } catch (error) {
    console.error('Failed to get location from IP:', error)
    // Default to New York if IP location fails
    return {
      latitude: defaultLocation.latitude,
      longitude: defaultLocation.longitude,
      city: 'New York'
    }
  }
}

export const MapController = ({
  initialCenter = {
    latitude: 40.7128,
    longitude: -74.0060
  },
  initialZoom = 14,
}: MapControllerProps) => {
  const primaryMapContainer = useRef<HTMLDivElement>(null)
  const secondaryMapContainer = useRef<HTMLDivElement>(null)
  const primaryMap = useRef<maplibregl.Map | null>(null)
  const secondaryMap = useRef<maplibregl.Map | null>(null)
  const controlsRef = useRef<HTMLDivElement>(null)
  const { resolvedTheme } = useTheme()
  const [location, setLocation] = useState<IpLocation | null>(null)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const [isMapLoaded, setIsMapLoaded] = useState(false)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [activeMap, setActiveMap] = useState<'primary' | 'secondary'>('primary')

  // Calculate header offset
  useEffect(() => {
    const calculatePosition = () => {
      const header = document.querySelector('.parkbeat-header')
      const headerContent = header?.querySelector('.header-content')
      
      if (header && headerContent) {
        const headerRect = header.getBoundingClientRect()
        const computedStyle = window.getComputedStyle(headerContent)
        const paddingLeft = parseInt(computedStyle.paddingLeft, 10)
        
        setPosition({
          top: headerRect.top + headerRect.height,
          left: paddingLeft
        })
      }
    }

    calculatePosition()
    window.addEventListener('resize', calculatePosition)
    return () => window.removeEventListener('resize', calculatePosition)
  }, [])

  // Get IP location on mount
  useEffect(() => {
    getIpLocation(initialCenter).then(setLocation)
  }, [])

  // Initial map setup
  useEffect(() => {
    if (primaryMap.current || !location) return
    console.log('🗺️ Initializing primary map')

    primaryMap.current = new maplibregl.Map({
      container: primaryMapContainer.current!,
      style: getMapStyle(resolvedTheme || 'light'),
      center: [location.longitude, location.latitude],
      zoom: initialZoom,
      attributionControl: false
    })

    primaryMap.current.once('load', () => {
      console.log('🗺️ Primary map loaded')
      setIsMapLoaded(true)
      setActiveMap('primary')
    })

    return () => {
      console.log('🗺️ Cleaning up maps')
      primaryMap.current?.remove()
      primaryMap.current = null
      secondaryMap.current?.remove()
      secondaryMap.current = null
    }
  }, [location, resolvedTheme])

  // Update map style when theme changes
  useEffect(() => {
    if (!primaryMap.current || !isMapLoaded) return
    console.log('🎨 Theme changed, starting transition')

    const currentMap = activeMap === 'primary' ? primaryMap.current : secondaryMap.current
    if (!currentMap) return

    const currentState = {
      center: currentMap.getCenter(),
      zoom: currentMap.getZoom(),
      bearing: currentMap.getBearing(),
      pitch: currentMap.getPitch()
    }
    console.log('📍 Current map state:', currentState, 'Active map:', activeMap)

    // Determine which container to use for the new map
    const targetContainer = activeMap === 'primary' ? secondaryMapContainer : primaryMapContainer
    const targetRef = activeMap === 'primary' ? secondaryMap : primaryMap

    // Clean up existing map in target container if it exists
    if (targetRef.current) {
      console.log(`🗑️ Removing existing ${activeMap === 'primary' ? 'secondary' : 'primary'} map`)
      targetRef.current.remove()
    }

    try {
      console.log('🔄 Creating new map with theme:', resolvedTheme)
      targetRef.current = new maplibregl.Map({
        container: targetContainer.current!,
        style: getMapStyle(resolvedTheme || 'light'),
        center: currentState.center,
        zoom: currentState.zoom,
        bearing: currentState.bearing,
        pitch: currentState.pitch,
        attributionControl: false
      })

      // When new map is ready, transition to it
      targetRef.current.once('load', () => {
        console.log('✨ New map loaded, starting transition')
        
        // Ensure the new map is fully rendered
        targetRef.current?.once('render', () => {
          console.log('🎨 New map rendered, starting fade')
          setIsTransitioning(true)

          // After fade completes, clean up old map
          setTimeout(() => {
            const oldMap = activeMap === 'primary' ? primaryMap : secondaryMap
            console.log(`🗑️ Removing old ${activeMap} map`)
            oldMap.current?.remove()
            oldMap.current = null
            
            // Update active map reference
            console.log('🔄 Updating active map reference')
            setActiveMap(activeMap === 'primary' ? 'secondary' : 'primary')
            setIsTransitioning(false)
          }, 300) // Match the CSS transition duration
        })
      })

      // Handle potential errors
      targetRef.current.on('error', (error) => {
        console.error('❌ Map error:', error)
        setIsTransitioning(false)
      })

    } catch (error) {
      console.error('❌ Error creating new map:', error)
      setIsTransitioning(false)
    }
  }, [resolvedTheme, isMapLoaded])

  // Log state changes
  useEffect(() => {
    console.log('🔄 Map state changed:', {
      isMapLoaded,
      isTransitioning,
      theme: resolvedTheme,
      activeMap
    })
  }, [isMapLoaded, isTransitioning, resolvedTheme, activeMap])

  const handleCenterMap = () => {
    const currentMap = activeMap === 'primary' ? primaryMap.current : secondaryMap.current
    if (currentMap && location) {
      currentMap.flyTo({
        center: [location.longitude, location.latitude],
        zoom: initialZoom,
        duration: 1500,
        essential: true
      })
    }
  }

  const handleZoom = (delta: number) => {
    const currentMap = activeMap === 'primary' ? primaryMap.current : secondaryMap.current
    if (currentMap) {
      const currentZoom = currentMap.getZoom()
      currentMap.easeTo({
        zoom: currentZoom + delta,
        duration: 300,
        easing: t => t * (2 - t) // Ease out quad
      })
    }
  }

  return (
    <div className="fixed inset-0" style={{ zIndex: 'var(--z-map)' }}>
      {/* Primary Map */}
      <div 
        ref={primaryMapContainer}
        className={cn(
          "absolute inset-0 transition-opacity duration-300",
          isMapLoaded ? "opacity-100" : "opacity-0",
          (isTransitioning && activeMap === 'primary') && "opacity-0",
          (!isTransitioning && activeMap === 'secondary') && "opacity-0"
        )}
      />
      
      {/* Secondary Map */}
      <div 
        ref={secondaryMapContainer}
        className={cn(
          "absolute inset-0 transition-opacity duration-100",
          (isTransitioning || activeMap === 'secondary') ? "opacity-100" : "opacity-0",
          (!isTransitioning && activeMap === 'primary') && "opacity-0"
        )}
      />
      
      {/* Map Controls */}
      <div 
        ref={controlsRef}
        className={cn(
          "fixed flex flex-row gap-1.5 transition-opacity duration-300",
          isMapLoaded ? "opacity-100" : "opacity-0"
        )}
        style={{ 
          zIndex: 'var(--z-header)',
          top: `${position.top}px`,
          left: `${position.left}px`
        }}
      >
        <button
          onClick={() => handleZoom(-1)}
          className="frosted-glass w-10 h-10 rounded-xl flex items-center justify-center hover:bg-white/90 dark:hover:bg-black/60 transition-colors"
          aria-label="Zoom out"
        >
          <i className="fa-solid fa-minus" aria-hidden="true" />
        </button>

        <button
          onClick={() => handleZoom(1)}
          className="frosted-glass w-10 h-10 rounded-xl flex items-center justify-center hover:bg-white/90 dark:hover:bg-black/60 transition-colors"
          aria-label="Zoom in"
        >
          <i className="fa-solid fa-plus" aria-hidden="true" />
        </button>

        <button
          onClick={handleCenterMap}
          className="frosted-glass w-10 h-10 rounded-xl flex items-center justify-center hover:bg-white/90 dark:hover:bg-black/60 transition-colors"
          aria-label="Center map"
        >
          <i className="fa-solid fa-location-crosshairs" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
} 