'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader } from '@googlemaps/js-api-loader'
import { cn } from '@/lib/utils'
import { GradientBlur } from '../../ui/gradient-blur'
import { generateId } from '@/lib/id'
import { useStreetViewValidation } from '@/hooks/use-street-view-validation'
import { useProjectData } from '@/hooks/use-tree-sockets'

declare global {
  interface Window {
    google: any
  }
}

interface ValidationMessage {
  message: string
  type: 'success' | 'error' | 'info' | 'warning'
}

interface StreetViewCardProps {
  lat: number
  lng: number
  heading?: number
  pitch?: number
  zoom?: number
  isLoading?: boolean
  projectId: string
  fundraiserId?: string
  onLoad?: () => void
  onPositionChange?: (lat: number, lng: number) => void
  onValidationSuccess?: (response: any) => void
  onValidationStateChange?: (state: { isValid: boolean }) => void
  saveDraft?: () => void
  className?: string
  showLoadingAnimation?: boolean
}

export const StreetViewCard = ({ 
  lat, 
  lng,
  heading = 0,
  pitch = 0,
  zoom = 1,
  isLoading: externalLoading,
  projectId,
  fundraiserId,
  onLoad, 
  onPositionChange,
  onValidationSuccess,
  onValidationStateChange,
  saveDraft,
  className,
  showLoadingAnimation = true
}: StreetViewCardProps) => {
  const streetViewRef = useRef<HTMLDivElement>(null)
  const streetViewInstance = useRef<google.maps.StreetViewPanorama | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [validationMessage, setValidationMessage] = useState<ValidationMessage | null>(null)

  const thisContextId = generateId()
  const { validateStreetView, isValidating } = useStreetViewValidation({
    projectId,
    fundraiserId,
    onSuccess: onValidationSuccess
  })

  const projectData = useProjectData(projectId)
  useEffect(() => {
    if (projectData?.data?.images?.length) {
      onValidationStateChange?.({ isValid: true })
    }
  }, [projectData])

  useEffect(() => {
    if (!lat || !lng || externalLoading || !streetViewRef.current) return

    setError(null)

    const loader = new Loader({
      apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
      version: 'weekly',
      libraries: ['places']
    })

    let isMounted = true

    loader.load().then((google) => {
      if (!isMounted) return

      const position = new google.maps.LatLng(lat, lng)
      const streetViewService = new google.maps.StreetViewService()

      streetViewService.getPanorama(
        { location: position, radius: 50 },
        (_data, status) => {
          if (!isMounted) return
          
          if (status === google.maps.StreetViewStatus.OK && streetViewRef.current) {
            streetViewInstance.current = new google.maps.StreetViewPanorama(streetViewRef.current, {
              position,
              pov: { heading, pitch },
              zoom,
              addressControl: false,
              showRoadLabels: false,
              motionTracking: false,
              motionTrackingControl: false,
              fullscreenControl: false,
              visible: true,
              panControl: false,
              linksControl: false,
              enableCloseButton: false,
              zoomControl: false,
              disableDefaultUI: true,
            })

            // Listen for position changes
            streetViewInstance.current.addListener('position_changed', () => {
              if (streetViewInstance.current && onPositionChange) {
                const newPosition = streetViewInstance.current.getPosition()
                if (newPosition) {
                  onPositionChange(newPosition.lat(), newPosition.lng())
                }
              }
            })

            // Add a small delay before showing to ensure smooth transition
            setTimeout(() => {
              if (!isMounted) return
              onLoad?.()
            }, 300)
          } else {
            setError('We couldn\'t find anything out here')
          }
        }
      )
    }).catch((err) => {
      if (!isMounted) return
      console.error('[StreetView] Error loading Google Maps:', err)
      setError('Failed to load Street View')
    })

    return () => {
      isMounted = false
      if (streetViewInstance.current) {
        try {
          // First set visible to false to trigger cleanup
          streetViewInstance.current.setVisible(false)
          
          // Force cleanup of WebGL context
          const element = streetViewRef.current
          console.log('[StreetView] Cleaning up element:', element)
          if (element) {
            const canvas = element.querySelector('canvas')
            console.log('[StreetView] Found canvas:', canvas)
            if (canvas) {
              const gl = canvas.getContext('webgl') || canvas.getContext('webgl2')
              console.log('[StreetView] WebGL context:', gl)
              if (gl) {
                gl.getExtension('WEBGL_lose_context')?.loseContext()
                console.log('[StreetView] Lost WebGL context')
              }
            }
            element.innerHTML = ''
          }

          // Set back to visible before nulling
          streetViewInstance.current.setVisible(true)
          streetViewInstance.current = null
        } catch (error) {
          console.error('Error cleaning up street view:', error)
        }
      }
      setError(null)
    }
  } , [lat, lng, heading, pitch, zoom, externalLoading, onLoad, onPositionChange])

  const handleStreetViewCapture = () => {
    // Don't allow capture if not authenticated
    if (!fundraiserId) {
      console.log('[StreetViewCard] Cannot capture: No fundraiser ID')
      return
    }

    setValidationMessage(null) // Clear any existing message
    
    // Get current street view parameters
    const currentParams = streetViewInstance.current?.getPov()
    const currentZoom = streetViewInstance.current?.getZoom()
    const currentPosition = streetViewInstance.current?.getPosition()

    if (!currentParams || !currentZoom || !currentPosition) {
      console.error('[StreetViewCard] Failed to get current street view parameters')
      return
    }

    saveDraft?.()

    validateStreetView(
      {
        lat: currentPosition.lat(),
        lng: currentPosition.lng(),
        heading: currentParams.heading,
        pitch: currentParams.pitch,
        zoom: currentZoom
      },
      {
        onError: (error) => {
          console.error('[StreetViewCard] Validation error:', {
            code: error.code,
            message: error.message,
            details: error.details
          })
          setValidationMessage({
            message: error.message,
            type: 'error'
          })
          onValidationStateChange?.({ isValid: false })
        },
        onSuccess: (response) => {
          const isValid = response.success === 'yes' || response.success === 'maybe'
          setValidationMessage({
            message: response.description,
            type: response.success === 'maybe' ? 'warning' : 'success'
          })
          onValidationStateChange?.({ isValid })
          console.log('[StreetViewCard] Validation successful:', response)
          onValidationSuccess?.(response)
        }
      }
    )
  }

  if (externalLoading) {
    return (
      <div className="flex items-center gap-3 text-sm text-zinc-500">
        <i className="fa-solid fa-circle-notch fa-spin" aria-hidden="true" />
        <span>Loading street view...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className={cn("rounded-lg", className)}>
        <div className="flex items-center gap-3 text-sm text-zinc-700 dark:text-zinc-300 pb-3 border-b border-zinc-200/50 dark:border-white/10 p-4 pt-0">
          <i className="fa-solid fa-street-view" aria-hidden="true" />
          <span>Street view</span>
        </div>
        <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-8 text-zinc-500 dark:text-zinc-400 space-y-2">
          <i className="fa-solid fa-camera-slash text-3xl mb-2" aria-hidden="true" />
          <i className="fa-regular fa-face-sad-tear text-2xl" aria-hidden="true" />
          <p>{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={cn("rounded-lg relative", className)}>
      <div className="flex items-center gap-3 text-sm text-zinc-700 dark:text-zinc-300 pb-3 border-b border-zinc-200/50 dark:border-white/10 p-4 pt-0">
        <i className="fa-solid fa-street-view" aria-hidden="true" />
        <span>Street view</span>
      </div>

      {validationMessage && (
        <div className="absolute inset-x-0 top-12 z-[100] mx-4 frosted-glass">
          <div className={cn(
            "frosted-glass rounded-lg shadow-lg flex items-center gap-3 px-4 py-3 mx-auto",
            "transition-all duration-300 ease-out",
            "cursor-pointer hover:scale-[1.02] active:scale-[0.98]",
            "max-w-md w-full"
          )}
          onClick={() => setValidationMessage(null)}
          role="button"
          aria-label="Dismiss validation message"
          >
            <i className={cn(
              "fa-solid text-lg",
              validationMessage.type === 'error' ? "fa-circle-exclamation text-red-500" :
              validationMessage.type === 'warning' ? "fa-triangle-exclamation text-yellow-500" :
              "fa-check-circle text-emerald-500"
            )} aria-hidden="true" />
            <p className="text-sm text-zinc-800 dark:text-zinc-200 flex-1">{validationMessage.message}</p>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setValidationMessage(null)
              }}
              className="ml-auto text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 p-1"
              aria-label="Dismiss"
            >
              <i className="fa-solid fa-xmark" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      <div className="relative">
        <div 
          ref={streetViewRef} 
          id={thisContextId}
          className={cn(
            "StreetViewCard w-full relative",
            "sm:min-h-[400px] h-[calc(100vh-22rem)]",
            "transition-all duration-300",
            showLoadingAnimation && isValidating 
              ? "opacity-50 scale-90 blur-[12px] rounded-3xl overflow-hidden shadow-[0_0_60px_rgba(0,0,0,0.5)]" 
              : "opacity-100 scale-100 blur-0"
          )}
          aria-label="Google Street View of the location"
        >
          {/* Validation Overlay - Only show if not using full animation */}
          {isValidating && !showLoadingAnimation && (
            <div className="absolute inset-0 bg-black/20 backdrop-blur-sm z-20 flex items-center justify-center">
              <div className="frosted-glass rounded-xl px-4 py-2 flex items-center gap-2">
                <i className="fa-solid fa-camera text-zinc-700 dark:text-zinc-300" aria-hidden="true" />
                <span className="text-sm text-zinc-700 dark:text-zinc-300">Analyzing view...</span>
              </div>
            </div>
          )}

          {/* Shutter Button Shadow Overlay */}
          <div 
            className={cn(
              "absolute bottom-0 left-0 right-0 h-40 pointer-events-none z-10",
              "transition-opacity duration-300",
              showLoadingAnimation && isValidating ? "opacity-90" : "opacity-100"
            )}
            style={{
              background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 70%)'
            }}
          />
          <div className="absolute pointer-events-none bottom-[-40px] h-[40%] w-full z-1">
            <GradientBlur targetBlur={2} direction="down" className="h-full w-full" />
          </div>
        </div>
      </div>

      {/* Shutter Button */}
      <button 
        onClick={handleStreetViewCapture}
        disabled={isValidating || !fundraiserId}
        className={cn(
          "absolute bottom-[8vw] left-1/2 -translate-x-1/2 z-10",
          "w-[20vw] h-[20vw] rounded-full flex items-center justify-center",
          "transition-all duration-200",
          !isValidating && fundraiserId && "hover:scale-110",
          "focus:outline-none focus:ring-4 focus:ring-white/30",
          "drop-shadow-[0_4px_12px_rgba(0,0,0,0.4)]",
          // Outer ring with shine animation
          "before:absolute before:inset-[-1.75vw] before:rounded-full before:border-[1vw]",
          "before:transition-all before:duration-300",
          isValidating ? [
            showLoadingAnimation ? [
              "before:border-white/70",
              "before:border-[4vw]",
              "before:animate-bulge",
              "before:scale-110",
            ] : [
              "before:border-white/50",
              "before:scale-100",
            ],
            "before:opacity-50"
          ] : [
            "before:border-white/90",
            "before:scale-100",
            "before:opacity-100"
          ].join(" "),
          // Inner circle
          "after:absolute after:inset-[0.75vw] after:rounded-full",
          "after:transition-all after:duration-300",
          isValidating ? [
            showLoadingAnimation ? [
              "after:bg-white/30",
              "after:scale-90",
              "after:opacity-0"
            ] : [
              "after:bg-white/50",
              "after:scale-95",
              "after:opacity-50"
            ]
          ] : [
            "after:bg-white/90",
            "after:scale-100",
            "after:opacity-100"
          ].join(" "),
          isValidating && (showLoadingAnimation ? "opacity-90" : "opacity-75"),
          isValidating && "cursor-not-allowed"
        )}
        aria-label="Take photo"
      >
        {isValidating && !showLoadingAnimation && (
          <i className="fa-solid fa-circle-notch fa-spin absolute text-white/90 text-xl" aria-hidden="true" />
        )}
      </button>
    </div>
  )
} 