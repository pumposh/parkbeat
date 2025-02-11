'use client'

import { useState, useEffect } from "react"
import { useMap } from "@/hooks/use-map"
import { useLiveTrees } from "./live-trees"
import { useRouter } from "next/navigation"

type TreeBedFormData = {
  name: string
  description: string
  location: {
    lat: number
    lng: number
  } | null
}

export const PlaceTreeForm = (props: {
  lat?: number
  lng?: number
}) => {
  const router = useRouter()
  const [formData, setFormData] = useState<TreeBedFormData>({
    name: "",
    description: "",
    location: {
      lat: props.lat || 0,
      lng: props.lng || 0
    }
  })

  const { map, isLoaded, error } = useMap()
  const { setTree, isPending } = useLiveTrees()

  useEffect(() => {
    if (!map) return

    if (props.lat && props.lng) {
      formData.location = {
        lat: props.lat,
        lng: props.lng
      }
    }
  }, [map])

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
          <label htmlFor="name" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Tree bed name
          </label>
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
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {formData.location 
              ? `Selected: ${formData.location.lat.toFixed(6)}, ${formData.location.lng.toFixed(6)}`
              : "Click on the map to select a location"}
          </p>
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