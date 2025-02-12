'use client'

import { useState, useEffect } from "react"
import { useMap } from "@/hooks/use-map"
import { useLiveTrees } from "./live-trees"
import { useRouter } from "next/navigation"
import { getLocationInfo } from "@/app/components/map-controller/utils"
import type { LocationInfo } from "@/app/components/map-controller/types"

type TreeBedFormData = {
  name: string
  description: string
  location: {
    lat: number
    lng: number
  } | null
  locationInfo?: LocationInfo
}

export const PlaceTreeForm = (props: {
  lat?: number
  lng?: number
}) => {
  const router = useRouter()
  const [formData, setFormData] = useState<TreeBedFormData>({
    name: "",
    description: "",
    location: props.lat && props.lng ? {
      lat: props.lat,
      lng: props.lng
    } : null
  })
  const [isLoadingLocation, setIsLoadingLocation] = useState(false)

  const { map, isLoaded, error } = useMap()
  const { setTree, isPending } = useLiveTrees()

  // Fetch location info when coordinates are set
  useEffect(() => {
    if (!formData.location) return

    const fetchLocationInfo = async () => {
      setIsLoadingLocation(true)
      try {
        const info = await getLocationInfo(formData.location!.lat, formData.location!.lng)
        setFormData(prev => ({
          ...prev,
          locationInfo: info,
          // If no name is set yet, suggest one based on the location
          name: prev.name || `Tree at ${info.address?.street || 'Unknown Location'}`
        }))
      } catch (error) {
        console.error('Failed to fetch location info:', error)
      } finally {
        setIsLoadingLocation(false)
      }
    }

    fetchLocationInfo()
  }, [formData.location?.lat, formData.location?.lng])

  // Listen for location updates from the map
  useEffect(() => {
    const handleLocationUpdate = (e: CustomEvent<{ lat: number; lng: number }>) => {
      setFormData(prev => ({
        ...prev,
        location: {
          lat: e.detail.lat,
          lng: e.detail.lng
        }
      }))
    }

    window.addEventListener('treebed:location', handleLocationUpdate as EventListener)
    return () => {
      window.removeEventListener('treebed:location', handleLocationUpdate as EventListener)
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!map || !formData.location) return
    
    try {
      await setTree({
        name: formData.name,
        lat: formData.location.lat,
        lng: formData.location.lng,
        status: 'live'
      })
      
      // Navigate back after successful creation
      router.back()
    } catch (err) {
      console.error("Failed to create tree bed:", err)
    }
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 p-4">
        <div className="flex items-center gap-3 text-red-800 dark:text-red-400">
          <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
          <p className="text-sm">Failed to load map: {error.message}</p>
        </div>
      </div>
    )
  }

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="flex items-center gap-3 text-zinc-500 dark:text-zinc-400">
          <i className="fa-solid fa-circle-notch fa-spin" aria-hidden="true" />
          <p className="text-sm">Loading map...</p>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <div>
          <input
            type="text"
            id="name"
            value={formData.name}
            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            className="input w-full"
            placeholder="e.g. Oak Tree on Main St"
            required
          />
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Description
          </label>
          <textarea
            id="description"
            value={formData.description}
            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            rows={3}
            className="input w-full"
            placeholder="Describe the tree bed location and any special care instructions..."
            required
          />
        </div>

        <div>
          <span className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Location
          </span>
          {isLoadingLocation ? (
            <div className="mt-2 flex items-center gap-2 text-sm text-zinc-500">
              <i className="fa-solid fa-circle-notch fa-spin" aria-hidden="true" />
              <span>Loading location details...</span>
            </div>
          ) : formData.locationInfo ? (
            <div className="mt-2 space-y-1">
              <p className="text-sm text-zinc-900 dark:text-zinc-100">
                {formData.locationInfo.displayName}
              </p>
              {formData.locationInfo.address && (
                <div className="text-xs space-y-0.5 text-zinc-500 dark:text-zinc-400">
                  {formData.locationInfo.address.street && (
                    <p>Street: {formData.locationInfo.address.street}</p>
                  )}
                  {formData.locationInfo.address.neighborhood && (
                    <p>Neighborhood: {formData.locationInfo.address.neighborhood}</p>
                  )}
                  <p>
                    {[
                      formData.locationInfo.address.city,
                      formData.locationInfo.address.state,
                      formData.locationInfo.address.postalCode
                    ].filter(Boolean).join(', ')}
                  </p>
                </div>
              )}
              <p className="text-xs text-zinc-400">
                Coordinates: {formData.location?.lat.toFixed(6)}, {formData.location?.lng.toFixed(6)}
              </p>
            </div>
          ) : (
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {formData.location 
                ? `Selected: ${formData.location.lat.toFixed(6)}, ${formData.location.lng.toFixed(6)}`
                : "Click on the map to select a location"}
            </p>
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!formData.location || isPending}
          className="w-full rounded-lg frosted-glass focus-visible:outline-none focus-visible:ring-zinc-300 dark:focus-visible:ring-zinc-100 hover:ring-zinc-300 dark:hover:ring-zinc-100 h-12 px-10 py-3 text-zinc-800 dark:text-zinc-100 font-medium transition hover:bg-white/90 dark:hover:bg-black/60"
        >
          {isPending ? (
            <>
              <i className="fa-solid fa-circle-notch fa-spin" aria-hidden="true" />
              <span>Creating...</span>
            </>
          ) : (
            'Create Tree Bed'
          )}
        </button>
      </div>
    </form>
  )
} 