'use client'

import { useState, useEffect, useCallback, useRef } from "react"
import { useMap } from "@/hooks/use-map"
import { Tree, useLiveTrees } from "../../../hooks/use-tree-sockets"
import { useRouter } from "next/navigation"
import type { LocationInfo } from "@/types/types"
import { useParams } from "next/navigation"
import { LocationInfoCard } from "./components/location-info-card"

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
  info?: LocationInfo
  tree?: Tree
}) => {
  const router = useRouter()
  const params = useParams()
  const treeId = params.treeId as string
  const { map, isLoaded, error } = useMap()
  const { setTree, isPending, treeMap } = useLiveTrees()

  // Add initialization tracking
  const [isInitialized, setIsInitialized] = useState(false)
  const existingTreeRef = useRef<typeof treeMap.get extends (key: any) => infer R ? R : never>(
    treeMap.get(treeId) || props.tree
  )

  // Form state
  const [formData, setFormData] = useState<TreeBedFormData>({
    name: existingTreeRef.current?.name || props.info?.address?.street || "",
    description: existingTreeRef.current?.description || "",
    location: null  // Start with no location to prevent premature updates
  })
  const [isLoadingLocation, setIsLoadingLocation] = useState(false)
  
  // Load or initialize tree data
  useEffect(() => {
    const existingTree = treeMap.get(treeId)
    console.log('existingTree', existingTree)
    
    // Store the existing tree reference for use in other effects
    existingTreeRef.current = existingTree || undefined
    
    const initializeTree = async () => {
      if (existingTree) {
        console.log('Loading existing tree:', existingTree.id)
        // Load existing tree data
        setFormData({
          name: existingTree.name,
          description: existingTree.description || "",
          location: { 
            lat: existingTree._loc_lat,
            lng: existingTree._loc_lng
          }
        })
      } else if (props.lat && props.lng && !isInitialized) {
        // Only initialize new tree with coordinates if not already initialized
        console.log('Initializing new tree with coordinates')
        setFormData(prev => ({
          ...prev,
          location: {
            lat: props.lat!,
            lng: props.lng!
          }
        }))
      }
      setIsInitialized(true)
    }

    initializeTree()
  }, [])

  // Fetch location info when coordinates change
  useEffect(() => {
    // Don't run until initialization is complete
    console.log('isInitialized', isInitialized)
    if (!formData.location || isLoadingLocation || !isInitialized) return

    let cancelled = false
    const fetchLocation = async () => {
      setIsLoadingLocation(true)
      try {
        if (cancelled) return

        const newName = !formData.name.trim() && props.info?.address?.street 
          ? `Tree at ${props.info.address.street}`
          : formData.name

        setFormData(prev => ({
          ...prev,
          locationInfo: props.info,
          name: newName
        }))

        // Sync with server
        await setTree({
          id: treeId,
          name: newName,
          lat: formData.location!.lat,
          lng: formData.location!.lng,
          status: existingTreeRef.current ? existingTreeRef.current.status : 'draft'
        })
      } catch (error) {
        console.error('Failed to fetch location info:', error)
      } finally {
        if (!cancelled) {
          setIsLoadingLocation(false)
        }
      }
    }

    const timeoutId = setTimeout(fetchLocation, 300)
    return () => {
      cancelled = true
      clearTimeout(timeoutId)
    }
  }, [isInitialized])

  // Handle form changes
  const debounceControl = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dataToWrite = useRef<Partial<TreeBedFormData>>({})
  const handleFormChange = useCallback(async (changes: Partial<TreeBedFormData>) => {
    if (!isInitialized) return

    setFormData(prev => ({ ...prev, ...changes }))
    dataToWrite.current = { ...dataToWrite.current, ...changes }

    // Only sync non-location changes immediately
    // (location changes are handled by the location effect)
    if (debounceControl.current) {
      clearTimeout(debounceControl.current)
      debounceControl.current = null
    }

    debounceControl.current = setTimeout(async () => {
      if (!dataToWrite.current.location && formData.location) {
        await setTree({
          id: treeId,
          name: dataToWrite.current.name || formData.name,
          description: dataToWrite.current.description || formData.description,
          lat: formData.location?.lat || props.lat || 0,
          lng: formData.location?.lng || props.lng || 0,
          status: existingTreeRef.current ? existingTreeRef.current.status : 'draft'
        })
      }
    }, 400)
  }, [treeId, existingTreeRef.current, formData.location, formData.name, setTree])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!map || !formData.location) return
    
    try {
      await setTree({
        id: treeId,
        name: formData.name,
        lat: formData.location.lat,
        lng: formData.location.lng,
        status: 'live'
      })
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
            onChange={(e) => handleFormChange({ name: e.target.value })}
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
            onChange={(e) => handleFormChange({ description: e.target.value })}
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
          <LocationInfoCard
            isLoading={isLoadingLocation}
            location={formData.location}
            locationInfo={formData.locationInfo || props.info}
          />
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