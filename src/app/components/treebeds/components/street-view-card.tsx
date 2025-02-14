'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader } from '@googlemaps/js-api-loader'
import { cn } from '@/lib/utils'
import { GradientBlur } from '../../ui/gradient-blur'
import { generateId } from '@/lib/id'

declare global {
  interface Window {
    google: any
  }
}

interface StreetViewCardProps {
  lat: number
  lng: number
  isLoading?: boolean
  onLoad?: () => void
  onPositionChange?: (lat: number, lng: number) => void
  onCapture?: (params: {
    lat: number
    lng: number
    heading: number
    pitch: number
    zoom: number
  }) => void | Promise<void>
  className?: string
}

export const StreetViewCard = ({ 
  lat, 
  lng, 
  isLoading: externalLoading, 
  onLoad, 
  onPositionChange,
  onCapture,
  className 
}: StreetViewCardProps) => {
  const streetViewRef = useRef<HTMLDivElement>(null)
  const streetViewInstance = useRef<google.maps.StreetViewPanorama | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isCapturing, setIsCapturing] = useState(false)

  const thisContextId = generateId()
  useEffect(() => {
    if (!lat || !lng || externalLoading || !streetViewRef.current) return

    setError(null)
    setIsReady(false)

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
              pov: { heading: 0, pitch: 0 },
              zoom: 1,
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
              setIsReady(true)
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
      setIsReady(false)
      setError(null)
    }
  } , [lat, lng, externalLoading, onLoad, onPositionChange])

  const handleCapture = async () => {

    if (!streetViewInstance.current || !onCapture) return

    try {
      setIsCapturing(true)
      const position = streetViewInstance.current.getPosition()
      const pov = streetViewInstance.current.getPov()
      const zoom = streetViewInstance.current.getZoom()

      console.log('position', position)
      console.log('pov', pov)
      console.log('zoom', zoom)

      if (position) {
        await onCapture({
          lat: position.lat(),
          lng: position.lng(),
          heading: pov.heading,
          pitch: pov.pitch,
          zoom,
        })
      }
    } finally {
      setIsCapturing(false)
    }
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
    <div className={cn("rounded-lg", className)}>
      <div className="flex items-center gap-3 text-sm text-zinc-700 dark:text-zinc-300 pb-3 border-b border-zinc-200/50 dark:border-white/10 p-4 pt-0">
        <i className="fa-solid fa-street-view" aria-hidden="true" />
        <span>Street view</span>
      </div>
      <div 
        ref={streetViewRef} 
        id={thisContextId}
        className={cn(
          "StreetViewCard w-full relative",
          // On mobile (< 640px), take full viewport height minus header and form inputs
          "sm:min-h-[400px] h-[calc(100vh-22rem)]",
          // Loading state animations - now tied to capturing state
          "transition-all duration-300",
          isCapturing ? "opacity-50 scale-90 blur-[16px] border-2xl overflow-hidden" : "opacity-100 scale-100 blur-0"
        )}
        aria-label="Google Street View of the location"
      >
        {/* Shutter Button Shadow Overlay */}
        <div 
          className={cn(
            "absolute bottom-0 left-0 right-0 h-40 pointer-events-none z-10",
            "transition-opacity duration-300",
            isCapturing ? "opacity-90" : "opacity-100"
          )}
          style={{
            background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 70%)'
          }}
        />
        <div className="absolute pointer-events-none bottom-[-40px] h-[40%] w-full z-1">
          <GradientBlur targetBlur={2} direction="down" className="h-full w-full" />
        </div>
        
      </div>
        {/* Shutter Button */}
        <button 
          onClick={handleCapture}
          disabled={isCapturing}
          className={cn(
            "absolute bottom-[8vw] left-1/2 -translate-x-1/2 z-10",
            "w-[20vw] h-[20vw] rounded-full flex items-center justify-center",
            "transition-all duration-200",
            !isCapturing && "hover:scale-110",
            "focus:outline-none focus:ring-4 focus:ring-white/30",
            "drop-shadow-[0_4px_12px_rgba(0,0,0,0.4)]",
            // Outer ring with shine animation
            "before:absolute before:inset-[-1.75vw] before:rounded-full before:border-[1vw]",
            isCapturing ? "before:border-white/30" : "before:border-white/90",
            isCapturing && "before:animate-shine",
            // Inner circle
            "after:absolute after:inset-[0.75vw] after:rounded-full",
            isCapturing ? "after:bg-white/0" : "after:bg-white/90",
            isCapturing && "opacity-90 cursor-not-allowed"
          )}
          aria-label="Take photo"
        >
        </button>
    </div>
  )
} 