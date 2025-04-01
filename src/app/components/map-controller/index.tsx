'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import { useTheme } from 'next-themes'
import maplibregl from 'maplibre-gl'
import { cn } from '@/lib/utils'
import { setMapInstance } from '@/hooks/use-map'
import { usePathname, useRouter } from 'next/navigation'
import './map-controller.css'
import { generateId } from '@/lib/id'
import { useLiveTrees } from '@/hooks/use-tree-sockets'
import type { Project } from '@/hooks/use-tree-sockets'
import { Markers } from './markers'
import { getMapStyle, getIpLocation } from './utils'
import type { MapControllerProps, IpLocation } from '@/types/types'
import { boundsToGeohash } from '@/lib/geo/geohash'
import { useNavigationState } from '@/hooks/use-nav-state'
import { usePersistentState } from '@/hooks/use-persistence'
import { useToast } from '@/app/components/toast'

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
  const [isNavigating, startNavigating] = useNavigationState()
  const { resolvedTheme } = useTheme()
  const [location, setLocation] = useState<IpLocation>({ ...initialCenter, city: 'Current Location' })
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const [isMapLoaded, setIsMapLoaded] = useState(false)
  const [isStyleChanging, setIsStyleChanging] = useState(false)
  const [mapError, setMapError] = useState<string | null>(null)
  const pathname = usePathname()
  const router = useRouter()
  const isPlacingTree = pathname === '/projects'
  const [isUserInteracting, setIsUserInteracting] = useState(false)
  const [isButtonVisible, setIsButtonVisible] = useState(false)
  const [isButtonLeaving, setIsButtonLeaving] = useState(false)
  const [isMapMoving, _setIsMapMoving] = useState(false)
  const { 
    projectMap, 
    contributionSummaryMap
  } = useLiveTrees()
  const previousProjects = useRef<Project[]>([])
  const updateTimeout = useRef<NodeJS.Timeout | undefined>(undefined)
  const [isMarkerNearCenter, setIsMarkerNearCenter] = useState(false)
  const [isControlsExpanded, setIsControlsExpanded] = useState(false)
  const collapseTimeout = useRef<NodeJS.Timeout | null>(null)
  const [hasLocationPermission, setHasLocationPermission, isInitialized] = usePersistentState<boolean>('location-permission', false)
  const [isLocationToastVisible, setIsLocationToastVisible] = useState(!hasLocationPermission)
  const lastPermissionState = useRef<string | null>(null)
  const toast = useToast()

  // Helper function to create GeoJSON features efficiently
  const createGeoJSONFeatures = (projects: Project[]) => {
    return projects.map((project: Project) => ({
      type: 'Feature' as const,
      geometry: { 
        type: 'Point' as const,
        coordinates: [project._loc_lng, project._loc_lat]
      },
      properties: {
        id: project.id,
        name: project.name,
        status: project.status,
        created_at: getCreatedAt(project),
        created_by: project._meta_created_by
      }
    }));
  };

  // Move these hooks to the component level, not inside useEffect
  const previousHash = useRef<string>('');
  // Memoize projects array transformation
  const projectsArray = useMemo(() => 
    Array.from(projectMap.values()), 
    [projectMap]
  );

  // Create a hash of projects to detect changes efficiently
  const getProjectsHash = (projects: Project[]) => {
    return projects.map(p => 
      `${p.id}-${p.status}-${Number(p._loc_lat).toFixed(6)}-${Number(p._loc_lng).toFixed(6)}-${p.name}`
    ).join('|');
  };

  // Calculate the current hash
  const currentHash = useMemo(() => 
    getProjectsHash(projectsArray),
    [projectsArray]
  );

  // Memoize feature creation - only recalculates when projects actually change
  const features = useMemo(() => 
    createGeoJSONFeatures(projectsArray),
    [projectsArray]
  );

  // Update source data when trees change - optimization
  useEffect(() => {
    if (!map.current || !isMapLoaded) {
      return;
    }

    // Clear any pending update
    if (updateTimeout.current) {
      clearTimeout(updateTimeout.current);
    }
    
    // Skip update if nothing changed
    if (currentHash === previousHash.current) return;
    previousHash.current = currentHash;

    // Debounce the update with slightly longer timeout for better batching
    updateTimeout.current = setTimeout(() => {
      if (!map.current?.isStyleLoaded() || !map.current?.getSource('trees')) {
        if (map.current?.isStyleLoaded()) {
          initializeLayers();
        } else {
          map.current?.once('style.load', initializeLayers);
        }
        return;
      }

      const source = map.current.getSource('trees') as maplibregl.GeoJSONSource;
      if (!source) return;

      // Use the memoized features
      source.setData({
        type: 'FeatureCollection',
        features
      });
      
      // Update previous projects reference
      previousProjects.current = projectsArray;
    }, 150);  // Slightly longer debounce for better batching

    return () => {
      if (updateTimeout.current) {
        clearTimeout(updateTimeout.current);
      }
    };
  }, [isMapLoaded, currentHash, features, projectsArray]);

  function getCreatedAt(project: Project) {
    if (!project._meta_created_at) return null;
    if (typeof project._meta_created_at === 'string') {
      return project._meta_created_at
    } else if (project._meta_created_at instanceof Date) {
      return project._meta_created_at.toISOString()
    } else {
      return null
    }
  }

  // Calculate header offset
  useEffect(() => {
    const calculatePosition = () => {
      const header = document.querySelector('.parkbeat-header')
      const headerRect = header?.getBoundingClientRect()
      const newPosition = {
        top: (headerRect?.top ?? 0) + (headerRect?.height ?? 0),
        left: 0
      }

      if (header && (
        newPosition.top !== position.top ||
        newPosition.left !== position.left
      )) {
        setPosition(newPosition)
      }
    }

    // Initial calculation
    calculatePosition()
    
    // Watch for DOM changes that might affect the header
    const observer = new MutationObserver(() => {
      calculatePosition()
    })
    
    // Observe the entire document for structural changes
    observer.observe(document.body, { 
      childList: true,
      attributes: true,
      attributeFilter: ['style', 'class']
    })
    
    // Also handle resize events
    window.addEventListener('resize', calculatePosition)
    
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', calculatePosition)
    }
  }, [])

  // Initialize location - prioritize precise location, fallback to IP-based
  useEffect(() => {
    let isSubscribed = true;
    let permissionCheckInterval: NodeJS.Timeout | null = null;

    // Check for location permission and set up periodic rechecking
    const checkPermission = async () => {
      try {
        const permissionStatus = await navigator.permissions?.query({ name: 'geolocation' });
        if (!isSubscribed || !permissionStatus) return;

        const currentState = permissionStatus.state;
        const granted = currentState === 'granted';

        // Only update states and show toasts if the permission state has actually changed
        if (lastPermissionState.current !== currentState) {
          lastPermissionState.current = currentState;
          setHasLocationPermission(granted);
          setIsLocationToastVisible(!granted);

          // Show appropriate toast based on state change
          if (currentState === 'granted') {
            // Only get user location if we don't already have it
            if (!location || location.city === 'Current Location') {
              getUserLocation();
            }
          } else if (currentState === 'prompt' && !isInitialized) {
            // Do nothing
          } else if (currentState === 'denied' && lastPermissionState.current === 'granted') {
            toast.show({
              message: 'Location access was denied. Using approximate location instead.',
              type: 'info',
              duration: 4000
            });
          }
        }

        // Set up permission change listener
        const handlePermissionChange = () => {
          if (!isSubscribed) return;
          const newState = permissionStatus.state;
          if (newState !== lastPermissionState.current) {
            lastPermissionState.current = newState;
            const isGranted = newState === 'granted';
            setHasLocationPermission(isGranted);
            setIsLocationToastVisible(!isGranted);
            
            if (isGranted) {
              getUserLocation();
              toast.show({
                message: 'Now showing your exact position 📍',
                type: 'success',
                duration: 3000
              });
            }
          }
        };

        permissionStatus.onchange = handlePermissionChange;
      } catch (err) {
        console.warn('Unable to query location permission:', err);
        if (!location) {
          getIpLocation(initialCenter).then(ipLocation => {
            if (!isSubscribed) return;
            setLocation(ipLocation);
          });
        }
      }
    };

    // Initial permission check
    checkPermission();
    
    // Set up periodic permission rechecking with a longer interval
    permissionCheckInterval = setInterval(checkPermission, 60000);
    
    return () => {
      isSubscribed = false;
      if (permissionCheckInterval) {
        clearInterval(permissionCheckInterval);
      }
    };
  }, [initialCenter, isInitialized]);
  
  // Get user's precise location
  const getUserLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setHasLocationPermission(true)
          setIsLocationToastVisible(false)
          
          const newLocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            city: location?.city || 'Current Location'
          }
          
          // Update the location state without forcing map reinitialization
          if (map.current) {
            map.current.flyTo({
              center: [newLocation.longitude, newLocation.latitude],
              zoom: initialZoom,
              duration: 1500,
              essential: true
            })
          }
          
          // Update location state after map movement to prevent double updates
          setLocation(newLocation)
        },
        (error) => {
          console.warn('Error getting user location:', error)
          setHasLocationPermission(false)
          setIsLocationToastVisible(true)
          
          // Handle different error types
          switch(error.code) {
            case error.PERMISSION_DENIED:
              toast.show({
                message: 'We need permission to find your exact location. Enable location services and click "Try Again" ✨',
                type: 'info',
                duration: 0, // Make it persistent
                persistent: true,
                position: 'bottom',
                actionLabel: 'Try Again',
                onAction: recheckLocationPermission
              })
              break
              
            case error.POSITION_UNAVAILABLE:
              toast.show({
                message: 'Hmm, we couldn\'t pinpoint your location. Using an approximate location for now 🌍',
                type: 'info',
                duration: 4000
              })
              break
              
            case error.TIMEOUT:
              toast.show({
                message: 'It\'s taking a while to find your location. Using an approximate position for now 🌎',
                type: 'info',
                duration: 4000,
                actionLabel: 'Try Again',
                onAction: recheckLocationPermission
              })
              break
          }
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      )
    } else {
      // Browser doesn't support geolocation
      toast.show({
        message: 'Your browser doesn\'t support location services. We\'re showing an approximate area instead 🌐',
        type: 'info',
        duration: 4000
      })
    }
  }

  // Function to manually recheck location permission
  const recheckLocationPermission = () => {
    navigator.permissions?.query({ name: 'geolocation' })
      .then(permissionStatus => {
        if (permissionStatus.state === 'granted') {
          getUserLocation()
          toast.show({
            message: 'Thanks! Now using your precise location 📍',
            type: 'success',
            duration: 3000
          })
        } else {
          // Try getting location directly which will trigger the browser's permission dialog
          getUserLocation()
        }
      })
      .catch(() => {
        // Permissions API not supported, try direct geolocation request
        getUserLocation()
      })
  }

  const openTreeDialog = () => {
    const id = generateId()
    const center = map.current?.getCenter()
    startNavigating()
    router.push(`/projects/${id}?lat=${center?.lat}&lng=${center?.lng}`)
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

    // Store handler references for proper cleanup
    const handlers = {
      movestart: () => setIsMapMoving(true),
      moveend: () => setIsMapMoving(false),
      mousedown: () => setIsUserInteracting(true),
      mouseup: () => setIsUserInteracting(false),
      dragstart: () => setIsUserInteracting(true),
      dragend: () => setIsUserInteracting(false),
      zoomstart: () => setIsMapMoving(true),
      zoomend: () => setIsMapMoving(false),
      error: (e: any) => {
        console.error('Map error:', e)
        setMapError('Something went wrong with the map')
      },
      'style.error': (e: any) => {
        console.error('Style error:', e)
        setMapError('Failed to load map style')
      }
    };

    // Store canvas event handlers separately
    const canvasHandlers = {
      webglcontextlost: (e: Event) => {
        console.error('WebGL context lost:', e)
        e.preventDefault()
        setMapError('Map context was lost. Please refresh the page.')
      },
      webglcontextrestored: () => {
        console.log('WebGL context restored')
        setMapError(null)
        map.current?.resize()
      }
    };

    try {
      if (!mapContainer.current) {
        throw new Error('Map container not found')
      }

      // Check for existing WebGL contexts and force cleanup if needed
      const existingCanvas = mapContainer.current.querySelector('canvas')
      if (existingCanvas) {
        const gl = existingCanvas.getContext('webgl') || existingCanvas.getContext('webgl2')
        if (gl) {
          gl.getExtension('WEBGL_lose_context')?.loseContext()
        }
        existingCanvas.remove()
      }

      map.current = new maplibregl.Map({
        container: mapContainer.current,
        style: getMapStyle(resolvedTheme || 'light'),
        center: [location.longitude, location.latitude],
        zoom: initialZoom,
        attributionControl: false
      } as maplibregl.MapOptions)

      const setupMapEvents = () => {
        if (!map.current) return
        setIsMapLoaded(true)
        setMapError(null)
        setMapInstance(map.current)

        // Add movement listeners using stored handler references
        Object.entries(handlers).forEach(([event, handler]) => {
          map.current?.on(event as any, handler);
        });
        
        // Handle WebGL context events
        const canvas = mapContainer.current?.querySelector('canvas')
        if (canvas) {
          Object.entries(canvasHandlers).forEach(([event, handler]) => {
            canvas.addEventListener(event, handler);
          });
        }

        sendBounds()
      }

      map.current.once('load', setupMapEvents)

    } catch (error) {
      console.error('Error initializing map:', error)
      setMapError('Failed to initialize map')
    }

    return () => {
      if (map.current) {
        try {
          // Force cleanup of WebGL context
          const canvas = mapContainer.current?.querySelector('canvas')
          if (canvas) {
            // Remove canvas event listeners using the same handler references
            Object.entries(canvasHandlers).forEach(([event, handler]) => {
              canvas.removeEventListener(event, handler);
            });

            // Clean up WebGL context
            const gl = canvas.getContext('webgl') || canvas.getContext('webgl2')
            if (gl) {
              gl.getExtension('WEBGL_lose_context')?.loseContext()
            }
          }

          // Properly remove event listeners using the same handler references
          Object.entries(handlers).forEach(([event, handler]) => {
            map.current?.off(event as any, handler);
          });
          
          // Remove the map instance and force garbage collection
          map.current.remove()
          setMapInstance(null)
          map.current = null
        } catch (error) {
          console.error('Error cleaning up map:', error)
        }
      }
    }
  }, [resolvedTheme, initialZoom, location])

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
          features: Array.from(projectMap.values()).map((project: Project) => ({
            type: 'Feature' as const,
            geometry: {
              type: 'Point' as const,
              coordinates: [project._loc_lng, project._loc_lat]
            },
            properties: {
              id: project.id,
              name: project.name,
              status: project.status,
              created_at: getCreatedAt(project),
              created_by: project._meta_created_by
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

  // Function to handle control expansion
  const handleExpandControls = () => {
    if (collapseTimeout.current) {
      clearTimeout(collapseTimeout.current)
    }
    setIsControlsExpanded(true)
  }

  // Function to start collapse timer
  const startCollapseTimer = () => {
    if (collapseTimeout.current) {
      clearTimeout(collapseTimeout.current)
    }
    collapseTimeout.current = setTimeout(() => {
      setIsControlsExpanded(false)
    }, 5000)
  }

  // Reset collapse timer when controls are interacted with
  const handleControlInteraction = () => {
    handleExpandControls()
    startCollapseTimer()
  }

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (collapseTimeout.current) {
        clearTimeout(collapseTimeout.current)
      }
    }
  }, [])

  return (
    <div className="map-container">
      {mapError ? (
        <div className="flex flex-col items-center justify-center w-full h-full min-h-[400px] text-center p-8 text-zinc-500 dark:text-zinc-400 space-y-2">
          <i className="fa-solid fa-map-marked-alt text-3xl mb-2" aria-hidden="true" />
          <i className="fa-regular fa-face-frown text-2xl" aria-hidden="true" />
          <p>{mapError}</p>
        </div>
      ) : (
        <>
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
            onMouseEnter={handleExpandControls}
            onMouseLeave={startCollapseTimer}
          >
            <div className={cn(
              "map-controls-inner",
              isControlsExpanded && "expanded"
            )}>
              <button
                onClick={() => {
                  handleControlInteraction()
                  setIsControlsExpanded(!isControlsExpanded)
                }}
                className={cn(
                  "map-control-button frosted-glass toggle",
                  isControlsExpanded && "expanded"
                )}
                aria-label="Toggle controls"
              >
                <i className="fa-solid fa-chevron-down" aria-hidden="true" />
                <div className={cn(
                  "location-badge",
                  (!isControlsExpanded && isLocationToastVisible) && "visible"
                )}></div>
              </button>

              <button
                onClick={() => {
                  handleControlInteraction()
                  handleZoom(-1)
                }}
                className="map-control-button frosted-glass zoom-out"
                aria-label="Zoom out"
              >
                <i className="fa-solid fa-minus" aria-hidden="true" />
              </button>

              <button
                onClick={() => {
                  handleControlInteraction()
                  handleZoom(1)
                }}
                className="map-control-button frosted-glass zoom-in"
                aria-label="Zoom in"
              >
                <i className="fa-solid fa-plus" aria-hidden="true" />
              </button>

              <button
                onClick={() => {
                  handleControlInteraction()
                  handleCenterMap()
                }}
                className="map-control-button frosted-glass center"
                aria-label="Center map"
              >
                <i className="fa-solid fa-location-crosshairs" aria-hidden="true" />
              </button>
              
              {/* Location Accuracy Card */}
              <div 
                className={cn(
                  "location-accuracy-card",
                  (isMapLoaded && isLocationToastVisible && isControlsExpanded) && "visible"
                )}
              >
                <button
                  className="location-accuracy-card-inner frosted-glass py-2 pl-3 pr-3"
                  onClick={() => {
                    handleControlInteraction(); // Keep controls open during action
                    getUserLocation();
                  }}
                  role="button"
                  aria-label="Use precise location"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      getUserLocation()
                    }
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    <i className="fa-solid fa-location-crosshairs text-orange-400 opacity-80 text-[9px]" aria-hidden="true" />
                    <p className="text-[10px] font-medium opacity-90">Approximate</p>
                  </div>
                  <div className="flex items-center mt-1 text-[9px] text-center opacity-70">
                    <span>Tap for precise location</span>
                  </div>
                </button>
              </div>
            </div>
          </div>

          {isPlacingTree && isMapLoaded && (
            <div className={cn(
              "pin-container",
              isMarkerNearCenter ? "pin-container-hidden" : "",
              isUserInteracting || isMapMoving ? "user-interacting" : ""
            )}>
              <i 
                className={cn(
                  "pin fa-solid fa-map-pin",
                  "transition-all"
                )}
                style={{ 
                  filter: `drop-shadow(0 ${isUserInteracting || isMapMoving ? 8 : 4}px ${isUserInteracting || isMapMoving ? 4 : 2}px rgb(0 0 0 / ${isUserInteracting || isMapMoving ? 0.15 : 0.1}))`,
                  transform: `translateY(${isUserInteracting || isMapMoving ? -24 : -6}px)`,
                  opacity: isUserInteracting || isMapMoving ? 0.6 : isMapLoaded ? 1 : 0,
                  willChange: 'transform, opacity'
                }}
                aria-hidden="true" 
              />
              <div 
                className={cn(
                  "pin-shadow  translate-y-[-12px]",
                  isUserInteracting || isMapMoving ? "opacity-100 scale-100" : "opacity-20 scale-90"
                )}
              />
              {isButtonVisible && !isMarkerNearCenter && (
                <button 
                  data-loading={isNavigating ? "true" : "false"}
                  className={cn(
                    "projects-button frosted-glass",
                    "z-10",
                    isButtonLeaving ? "projects-button-leave" : "projects-button-enter"
                  )}
                  onClick={(e) => {
                    e.stopPropagation()
                    e.preventDefault()
                    openTreeDialog()
                  }}
                >
                  <div className="projects-button-text text-sm p-2 px-3 min-w-[145px] flex items-center justify-between gap-2">
                    <div className="projects-button-text-text">New project</div>
                    <i className="fa-solid fa-plus text-md" aria-hidden="true" />
                  </div>
                </button>
              )}
            </div>
          )}

          {map.current && isMapLoaded && (
            <Markers
              projects={Array.from(projectMap.values())} 
              map={map.current} 
              onMarkerNearCenter={setIsMarkerNearCenter}
              contributionSummaryMap={contributionSummaryMap}
            />
          )}
        </>
      )}
    </div>
  )
} 