'use client'

import { useEffect, useRef, useState } from 'react'
import { useTheme } from 'next-themes'
import maplibregl from 'maplibre-gl'
import { cn } from '@/lib/utils'
import { setMapInstance } from '@/hooks/use-map'
import { usePathname, useRouter } from 'next/navigation'
import './map-controller.css'
import { generateId } from '@/lib/id'
import { useLiveTrees } from '@/hooks/use-tree-sockets'
import type { Tree } from '@/hooks/use-tree-sockets'
import { Markers } from './markers'
import { getMapStyle, getIpLocation } from './utils'
import type { MapControllerProps, IpLocation } from '@/types/types'
import { boundsToGeohash } from '@/lib/geo/geohash'

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
  const { treeMap } = useLiveTrees()
  const previousTrees = useRef<Tree[]>([])
  const updateTimeout = useRef<NodeJS.Timeout | undefined>(undefined)
  const [isMarkerNearCenter, setIsMarkerNearCenter] = useState(false)

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
    const boundsDetail = {
      north: bounds.getNorth(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      west: bounds.getWest()
    };

    // Store the bounds detail in window object
    window.mapBounds = boundsDetail;

    // Calculate and store geohash
    const geohash = boundsToGeohash(boundsDetail);
    window.currentGeohash = geohash;

    window.dispatchEvent(new CustomEvent<typeof boundsDetail>('map:newBounds', {
      detail: boundsDetail
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

  // Initialize layers function - moving it outside effects to reuse
  const initializeLayers = async () => {
    if (!map.current) {
      console.log('Map not initialized yet')
      return
    }
    console.log('Map style loaded, adding markers')

    try {
      // Remove existing layers and source if they exist
      const treeStates = ['draft', 'live', 'archived'] as const
      treeStates.forEach(status => {
        const labelLayerId = `trees-${status}-label`
        if (map.current?.getLayer(labelLayerId)) {
          map.current.removeLayer(labelLayerId)
        }
      })

      if (map.current.getSource('trees')) {
        map.current.removeSource('trees')
      }

      // Wait for the style to be loaded
      if (!map.current.isStyleLoaded()) {
        await new Promise<void>(resolve => {
          map.current!.once('style.load', () => resolve())
        })
      }

      // Create or update the GeoJSON source
      map.current.addSource('trees', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: Array.from(treeMap.values()).map((tree: Tree) => ({
            type: 'Feature' as const,
            geometry: {
              type: 'Point' as const,
              coordinates: [tree._loc_lng, tree._loc_lat]
            },
            properties: {
              id: tree.id,
              name: tree.name,
              status: tree.status,
              created_at: tree._meta_created_at ? tree._meta_created_at.toISOString() : null,
              created_by: tree._meta_created_by
            }
          }))
        }
      })
    } catch (error) {
      console.error('Error initializing layers:', error)
    }
  }

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

        // Wait for style to load then reinitialize layers
        map.current!.once('style.load', () => {
          console.log('Style loaded after theme change, reinitializing layers')
          initializeLayers()
        })
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

  // Update source data when trees change
  useEffect(() => {
    if (!map.current || !isMapLoaded) {
      console.log('Map not ready for data update')
      return
    }

    // Clear any pending update
    if (updateTimeout.current) {
      clearTimeout(updateTimeout.current)
    }

    // Check if the trees have actually changed
    const treesChanged = Array.from(treeMap.values()).length !== previousTrees.current.length ||
      Array.from(treeMap.values()).some((tree, index) => {
        const prevTree = previousTrees.current[index]
        return !prevTree || 
          tree.id !== prevTree.id ||
          tree.status !== prevTree.status ||
          tree._loc_lat !== prevTree._loc_lat ||
          tree._loc_lng !== prevTree._loc_lng ||
          tree.name !== prevTree.name
      })

    if (!treesChanged) return

    // Debounce the update
    updateTimeout.current = setTimeout(() => {
      // If style is not loaded or source doesn't exist, initialize layers
      if (!map.current?.isStyleLoaded() || !map.current?.getSource('trees')) {
        console.log('Style not loaded or source missing, reinitializing layers')
        if (map.current?.isStyleLoaded()) {
          initializeLayers()
        } else {
          map.current?.once('style.load', initializeLayers)
        }
        return
      }

      const source = map.current.getSource('trees') as maplibregl.GeoJSONSource
      if (!source) {
        console.log('Trees source not found after check, something went wrong')
        return
      }

      const features = Array.from(treeMap.values()).map((tree: Tree) => ({
        type: 'Feature' as const,
        geometry: { 
          type: 'Point' as const,
          coordinates: [tree._loc_lng, tree._loc_lat]
        },
        properties: {
          id: tree.id,
          name: tree.name,
          status: tree.status,
          created_at: tree._meta_created_at ? tree._meta_created_at.toISOString() : null,
          created_by: tree._meta_created_by
        }
      }))

      console.log('Updating source with features:', features)
      source.setData({
        type: 'FeatureCollection',
        features
      })

      // Update previous trees reference
      previousTrees.current = Array.from(treeMap.values())
    }, 100) // 100ms debounce

    return () => {
      if (updateTimeout.current) {
        clearTimeout(updateTimeout.current)
      }
    }
  }, [isMapLoaded, treeMap])

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

      {isPlacingTree && isMapLoaded && (
        <div className={cn(
          "pin-container",
          isMarkerNearCenter ? "hidden" : "",
          isUserInteracting || isMapMoving ? "user-interacting" : ""
        )}>
          <i 
            className={cn(
              "pin fa-solid fa-map-pin",
              "transition-all"
            )}
            style={{ 
              filter: `drop-shadow(0 ${isUserInteracting || isMapMoving ? 8 : 4}px ${isUserInteracting || isMapMoving ? 4 : 2}px rgb(0 0 0 / ${isUserInteracting || isMapMoving ? 0.15 : 0.1}))`,
              transform: `translateY(${isUserInteracting || isMapMoving ? -24 : 0}px)`,
              opacity: isUserInteracting || isMapMoving ? 0.6 : isMapLoaded ? 1 : 0,
              willChange: 'transform, opacity'
            }}
            aria-hidden="true" 
          />
          <div 
            className={cn(
              "pin-shadow",
              isUserInteracting || isMapMoving ? "opacity-100 scale-100" : "opacity-20 scale-90"
            )}
          />
          {isButtonVisible && !isMarkerNearCenter && (
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

      {map.current && isMapLoaded && (
        <Markers
          trees={Array.from(treeMap.values())} 
          map={map.current} 
          onMarkerNearCenter={setIsMarkerNearCenter}
        />
      )}
    </div>
  )
} 