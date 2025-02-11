'use client'

import { useEffect, useRef, useState } from 'react'
import { useTheme } from 'next-themes'
import maplibregl from 'maplibre-gl'
import { cn } from '@/lib/utils'
import { setMapInstance } from '@/hooks/use-map'
import { usePathname, useRouter } from 'next/navigation'
import './map-controller.css'
import { generateId } from '@/lib/id'
import { useLiveTrees } from '../treebeds/live-trees'
import type { TreeStatus } from '@/server/routers/tree-router'

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

interface Pin {
  id: string
  lat: number
  lng: number
  type?: string
  data?: any
}

interface Tree {
  id: string
  name: string
  status: TreeStatus
  _loc_lat: number
  _loc_lng: number
  _meta_created_by: string
  _meta_updated_at: Date
  _meta_created_at: Date
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
  const [isStyleChanging, setIsStyleChanging] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const isPlacingTree = pathname === '/manage-trees'
  const [isUserInteracting, setIsUserInteracting] = useState(false)
  const [isButtonVisible, setIsButtonVisible] = useState(false)
  const [isButtonLeaving, setIsButtonLeaving] = useState(false)
  const [isMapMoving, _setIsMapMoving] = useState(false)
  const [pins, setPins] = useState<Map<string, Pin>>(new Map())
  const { nearbyTrees, isLoadingTrees } = useLiveTrees()

  // Calculate header offset
  useEffect(() => {
    const calculatePosition = () => {
      const header = document.querySelector('.parkbeat-header')
      
      if (header) {
        const headerRect = header.getBoundingClientRect()
        setPosition({
          top: headerRect.top + headerRect.height,
          left: 0
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

  const openTreeDialog = () => {
    const id = generateId()
    const center = map.current?.getCenter()
    router.push(`/manage-trees/${id}?lat=${center?.lat}&lng=${center?.lng}`)
  }

  const sendBounds = () => {
    if (!map.current) return
    const bounds = map.current.getBounds()
    window.dispatchEvent(new CustomEvent<{
      top: number
      left: number
      bottom: number
      right: number
    }>('map:newBounds', {
      detail: {
        top: bounds.getNorth(),
        left: bounds.getWest(),
        bottom: bounds.getSouth(),
        right: bounds.getEast()
      }
    }))
  }

  const setIsMapMoving = (value: boolean) => {
    _setIsMapMoving(value)

    if (!map.current) return

    sendBounds()
  }

  // Initialize map
  useEffect(() => {
    if (map.current || !location) return

    map.current = new maplibregl.Map({
      container: mapContainer.current!,
      style: getMapStyle(resolvedTheme || 'light'),
      center: [location.longitude, location.latitude],
      zoom: initialZoom,
      attributionControl: false
    })

    const setupMapEvents = () => {
      if (!map.current) return
      setIsMapLoaded(true)
      setMapInstance(map.current)

      // Add movement listeners
      map.current.on('movestart', () => setIsMapMoving(true))
      map.current.on('moveend', () => setIsMapMoving(false))
      map.current.on('mousedown', () => setIsUserInteracting(true))
      map.current.on('mouseup', () => setIsUserInteracting(false))
      map.current.on('dragstart', () => setIsUserInteracting(true))
      map.current.on('dragend', () => setIsUserInteracting(false))
      map.current.on('zoomstart', () => setIsMapMoving(true))
      map.current.on('zoomend', () => setIsMapMoving(false))

      sendBounds()
    }

    map.current.once('load', setupMapEvents)

    return () => {
      if (map.current) {
        map.current.off('movestart', () => setIsMapMoving(true))
        map.current.off('moveend', () => setIsMapMoving(false))
        map.current.off('mousedown', () => setIsUserInteracting(true))
        map.current.off('mouseup', () => setIsUserInteracting(false))
        map.current.off('dragstart', () => setIsUserInteracting(true))
        map.current.off('dragend', () => setIsUserInteracting(false))
        map.current.off('zoomstart', () => setIsMapMoving(true))
        map.current.off('zoomend', () => setIsMapMoving(false))
        map.current.remove()
        setMapInstance(null)
        map.current = null
      }
    }
  }, [location])

  // Handle theme changes
  useEffect(() => {
    if (!map.current || !isMapLoaded) return

    const updateStyle = async () => {
      setIsStyleChanging(true)

      const center = map.current!.getCenter()
      const zoom = map.current!.getZoom()
      const bearing = map.current!.getBearing()
      const pitch = map.current!.getPitch()

      try {
        await map.current!.setStyle(getMapStyle(resolvedTheme || 'light'))
        
        map.current!.setCenter(center)
        map.current!.setZoom(zoom)
        map.current!.setBearing(bearing)
        map.current!.setPitch(pitch)
      } finally {
        setIsStyleChanging(false)
      }
    }

    updateStyle()
  }, [resolvedTheme, isMapLoaded])

  // Handle tree bed placement
  useEffect(() => {
    if (!map.current || !isPlacingTree) return

    const handleClick = (e: maplibregl.MapMouseEvent) => {
      if (!isPlacingTree) return
      
      const { lngLat } = e
      // Dispatch a custom event that the form can listen to
      window.dispatchEvent(new CustomEvent('treebed:location', {
        detail: {
          lat: lngLat.lat,
          lng: lngLat.lng
        }
      }))
    }

    map.current.on('click', handleClick)

    return () => {
      map.current?.off('click', handleClick)
    }
  }, [isPlacingTree])

  useEffect(() => {
    let showTimeout: NodeJS.Timeout
    let hideTimeout: NodeJS.Timeout

    const showButton = () => {
      clearTimeout(hideTimeout)
      showTimeout = setTimeout(() => {
        setIsButtonVisible(true)
        setIsButtonLeaving(false)
      }, 750)
    }

    const hideButton = () => {
      clearTimeout(showTimeout)
      if (isButtonVisible) {
        setIsButtonLeaving(true)
        hideTimeout = setTimeout(() => {
          setIsButtonVisible(false)
          setIsButtonLeaving(false)
        }, 150)
      }
    }

    if (isUserInteracting || isMapMoving) {
      hideButton()
    } else {
      showButton()
    }

    return () => {
      clearTimeout(showTimeout)
      clearTimeout(hideTimeout)
    }
  }, [isUserInteracting, isMapMoving, isButtonVisible])

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

  // Initialize map pins layer
  useEffect(() => {
    if (!map.current || !isMapLoaded) return

    // Add a source for pins if it doesn't exist
    if (!map.current.getSource('pins')) {
      map.current.addSource('pins', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        }
      })
    }

    // Add a layer for pins if it doesn't exist
    if (!map.current.getLayer('pins-layer')) {
      map.current.addLayer({
        id: 'pins-layer',
        type: 'symbol',
        source: 'pins',
        layout: {
          'text-field': '📍',
          'text-size': 24,
          'text-allow-overlap': true,
          'text-ignore-placement': true,
          'text-anchor': 'bottom'
        }
      })
    }

    // Update the pins source when pins state changes
    const updatePinsSource = () => {
      if (!map.current) return

      const features = Array.from(pins.values()).map(pin => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [pin.lng, pin.lat]
        },
        properties: {
          id: pin.id,
          type: pin.type,
          ...pin.data
        }
      }))

      const source = map.current.getSource('pins') as maplibregl.GeoJSONSource
      source?.setData({
        type: 'FeatureCollection',
        features
      })
    }

    // Subscribe to pin updates
    const handlePinUpdate = (e: CustomEvent<Pin>) => {
      setPins(prev => {
        const next = new Map(prev)
        next.set(e.detail.id, e.detail)
        return next
      })
    }

    const handlePinRemove = (e: CustomEvent<{ id: string }>) => {
      setPins(prev => {
        const next = new Map(prev)
        next.delete(e.detail.id)
        return next
      })
    }

    window.addEventListener('pin:update', handlePinUpdate as EventListener)
    window.addEventListener('pin:remove', handlePinRemove as EventListener)

    // Initial update
    updatePinsSource()

    return () => {
      window.removeEventListener('pin:update', handlePinUpdate as EventListener)
      window.removeEventListener('pin:remove', handlePinRemove as EventListener)
    }
  }, [isMapLoaded, pins])

  // Update pins when trees change
  useEffect(() => {
    if (!nearbyTrees || !Array.isArray(nearbyTrees)) return

    // Convert trees to pins
    nearbyTrees.forEach((tree: Tree) => {
      window.dispatchEvent(new CustomEvent('pin:update', {
        detail: {
          id: tree.id,
          lat: tree._loc_lat,
          lng: tree._loc_lng,
          type: 'tree',
          data: {
            name: tree.name,
            status: tree.status
          }
        }
      }))
    })
  }, [nearbyTrees])

  return (
    <div className="map-container">
      <div 
        ref={mapContainer} 
        className={cn(
          "map-view",
          isMapLoaded ? "opacity-100" : "opacity-0",
          isStyleChanging && "opacity-0"
        )}
      />
      
      {/* Map Controls */}
      <div 
        ref={controlsRef}
        className={cn(
          "map-controls",
          isMapLoaded ? "opacity-100" : "opacity-0",
          isStyleChanging && "opacity-0"
        )}
        style={{ 
          top: `${position.top}px`
        }}
      >
        <button
          onClick={() => handleZoom(-1)}
          className="map-control-button frosted-glass"
          aria-label="Zoom out"
        >
          <i className="fa-solid fa-minus" aria-hidden="true" />
        </button>

        <button
          onClick={() => handleZoom(1)}
          className="map-control-button frosted-glass"
          aria-label="Zoom in"
        >
          <i className="fa-solid fa-plus" aria-hidden="true" />
        </button>

        <button
          onClick={handleCenterMap}
          className="map-control-button frosted-glass"
          aria-label="Center map"
        >
          <i className="fa-solid fa-location-crosshairs" aria-hidden="true" />
        </button>
      </div>

      {isPlacingTree && (
        <div className="pin-container">
          <i 
            className={cn(
              "pin fa-solid fa-map-pin",
              "transition-all duration-300 ease-out"
            )}
            style={{ 
              filter: `drop-shadow(0 ${isUserInteracting || isMapMoving ? 8 : 4}px ${isUserInteracting || isMapMoving ? 4 : 2}px rgb(0 0 0 / ${isUserInteracting || isMapMoving ? 0.15 : 0.1}))`,
              transform: `translateY(${isUserInteracting || isMapMoving ? -24 : 0}px)`,
              opacity: isUserInteracting || isMapMoving ? 0.6 : 1,
              willChange: 'transform'
            }}
            aria-hidden="true" 
          />
          <div 
            className={cn(
              "pin-shadow",
              isUserInteracting || isMapMoving ? "opacity-100 scale-100" : "opacity-20 scale-90"
            )}
          />
          {isButtonVisible && (
            <button 
              className={cn(
                "manage-trees-button frosted-glass",
                "z-10",
                isButtonLeaving ? "manage-trees-button-leave" : "manage-trees-button-enter"
              )}
              onClick={(e) => {
                e.stopPropagation()
                e.preventDefault()
                openTreeDialog()
              }}
            >
              <div className="manage-trees-button-text text-sm p-2 px-3 min-w-[145px] flex items-center justify-between gap-2">
                <div className="manage-trees-button-text-text">Add tree bed</div>
                <i className="fa-solid fa-plus text-md" aria-hidden="true" />
              </div>
            </button>
          )}
        </div>
      )}
    </div>
  )
} 