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
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const controlsRef = useRef<HTMLDivElement>(null)
  const { resolvedTheme } = useTheme()
  const [location, setLocation] = useState<IpLocation | null>(null)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const [isMapLoaded, setIsMapLoaded] = useState(false)

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

  useEffect(() => {
    if (map.current || !location) return // initialize map only once and when we have location

    map.current = new maplibregl.Map({
      container: mapContainer.current!,
      style: getMapStyle(resolvedTheme || 'light'),
      center: [location.longitude, location.latitude],
      zoom: initialZoom,
      attributionControl: false
    })

    map.current.once('load', () => {
      setIsMapLoaded(true)
    })

    // Cleanup on unmount
    return () => {
      if (map.current) {
        map.current.remove()
        map.current = null
      }
    }
  }, [location, resolvedTheme])

  // Update map style when theme changes
  useEffect(() => {
    if (map.current) {
      // Store current map state
      const center = map.current.getCenter()
      const zoom = map.current.getZoom()
      const bearing = map.current.getBearing()
      const pitch = map.current.getPitch()

      map.current.once('styledata', () => {
        // Restore map state after style loads
        map.current?.setCenter(center)
        map.current?.setZoom(zoom)
        map.current?.setBearing(bearing)
        map.current?.setPitch(pitch)
      })

      map.current.setStyle(getMapStyle(resolvedTheme || 'light'))
    }
  }, [resolvedTheme])

  const handleCenterMap = () => {
    if (map.current && location) {
      map.current.flyTo({
        center: [location.longitude, location.latitude],
        zoom: initialZoom,
        duration: 1500,
        essential: true
      })
    }
  }

  const handleZoom = (delta: number) => {
    if (map.current) {
      const currentZoom = map.current.getZoom()
      map.current.easeTo({
        zoom: currentZoom + delta,
        duration: 300,
        easing: t => t * (2 - t) // Ease out quad
      })
    }
  }

  return (
    <div className="fixed inset-0" style={{ zIndex: 'var(--z-map)' }}>
      <div 
        ref={mapContainer} 
        className={cn(
          "w-full h-full transition-opacity duration-500",
          isMapLoaded ? "opacity-100" : "opacity-0"
        )}
      />
      
      {/* Map Controls */}
      <div 
        ref={controlsRef}
        className={cn(
          "fixed flex flex-row gap-1.5 transition-opacity duration-500",
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