'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader } from '@googlemaps/js-api-loader'
import { cn } from '@/lib/utils'

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
}

export const StreetViewCard = ({ lat, lng, isLoading, onLoad }: StreetViewCardProps) => {
  const streetViewRef = useRef<HTMLDivElement>(null)
  const streetViewInstance = useRef<google.maps.StreetViewPanorama | null>(null)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    if (!lat || !lng || isLoading || !streetViewRef.current) return

    const loader = new Loader({
      apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
      version: 'weekly',
      libraries: ['places']
    })

    loader.load().then((google) => {
      const position = new google.maps.LatLng(lat, lng)
      const streetViewService = new google.maps.StreetViewService()

      streetViewService.getPanorama(
        { location: position, radius: 50 },
        (data, status) => {
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

            // Add a small delay before showing to ensure smooth transition
            setTimeout(() => {
              setIsReady(true)
              onLoad?.()
            }, 300)
          }
        }
      )
    })

    return () => {
      if (streetViewInstance.current) {
        const element = streetViewRef.current
        if (element) element.innerHTML = ''
        streetViewInstance.current = null
      }
      setIsReady(false)
    }
  }, [lat, lng, isLoading, onLoad])

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <i className="fa-solid fa-circle-notch fa-spin" aria-hidden="true" />
        <span>Loading street view...</span>
      </div>
    )
  }

  return (
    <div className="frosted-glass rounded-lg">
      <div className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300 p-3 border-b border-zinc-200/50 dark:border-white/10">
        <i className="fa-solid fa-street-view" aria-hidden="true" />
        <span>Street View</span>
      </div>
      <div 
        ref={streetViewRef} 
        className={cn(
          "StreetViewCard w-full min-h-[300px] rounded-b-lg transition-opacity duration-300",
          isReady ? "opacity-100" : "opacity-0"
        )}
        aria-label="Google Street View of the location"
      />
    </div>
  )
} 