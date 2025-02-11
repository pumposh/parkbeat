'use client'

import { useState, useEffect } from "react"
import { useMap } from "@/hooks/use-map"

type TreeBedFormData = {
  name: string
  description: string
  location: {
    lat: number
    lng: number
  } | null
}

export const PlaceTreeForm = () => {
  const [formData, setFormData] = useState<TreeBedFormData>({
    name: "",
    description: "",
    location: null
  })

  const { map, isLoaded, error } = useMap()

  useEffect(() => {
    if (!map) return

    const handleLocationSelect = (e: CustomEvent<{ lat: number, lng: number }>) => {
      setFormData(prev => ({
        ...prev,
        location: e.detail
      }))
    }

    window.addEventListener('treebed:location', handleLocationSelect as EventListener)
    return () => window.removeEventListener('treebed:location', handleLocationSelect as EventListener)
  }, [map])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!map || !formData.location) return
    
    try {
      // TODO: Implement tree bed creation
      console.log("Form submitted:", formData)
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
          disabled={!formData.location}
          className="btn btn-primary"
        >
          Create Tree Bed
        </button>
      </div>
    </form>
  )
} 