'use client'

import { useState, useEffect, useCallback, useRef } from "react"
import { useMap } from "@/hooks/use-map"
import { Tree, useLiveTrees } from "../../../hooks/use-tree-sockets"
import { useRouter } from "next/navigation"
import type { LocationInfo } from "@/types/types"
import { useParams } from "next/navigation"
import { LocationInfoCard } from "./components/location-info-card"
import { StreetViewCard } from "./components/street-view-card"
import { useToast } from "@/app/components/toast"
import { cn } from "@/lib/utils"

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
  onClose?: () => void
}) => {
  const router = useRouter()
  const params = useParams()
  const treeId = params.treeId as string
  const { map, isLoaded, error } = useMap()
  const { setTree, isPending, treeMap } = useLiveTrees()
  const { show: showToast } = useToast()
  const isReadOnly = props.tree?.status === 'live'

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
    console.log('[PlaceTreeForm] existingTree', existingTree)
    
    // Store the existing tree reference for use in other effects
    existingTreeRef.current = existingTree || undefined
    
    const initializeTree = async () => {
      if (existingTree) {
        console.log('[PlaceTreeForm] Loading existing tree:', existingTree.id)
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
        console.log('[PlaceTreeForm] Initializing new tree with coordinates')
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
  }, [treeMap, treeId, props.lat, props.lng])

  // Fetch location info when coordinates change
  useEffect(() => {
    if (!formData.location || isLoadingLocation) return

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

        // Only set status to draft for new trees
        const status = props.tree?.status
          || existingTreeRef.current?.status
          || 'draft'

        // Sync with server
        await setTree({
          id: treeId,
          name: newName,
          lat: formData.location!.lat,
          lng: formData.location!.lng,
          status
        })
      } catch (error) {
        console.error('[PlaceTreeForm] Failed to fetch location info:', error)
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
  }, [formData.location, props.info, treeId, setTree])

  // Handle form changes
  const debounceControl = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dataToWrite = useRef<Partial<TreeBedFormData>>({})
  const handleFormChange = useCallback(async (changes: Partial<TreeBedFormData>) => {
    setFormData(prev => ({ ...prev, ...changes }))
    dataToWrite.current = { ...dataToWrite.current, ...changes }

    // Only sync non-location changes immediately
    // (location changes are handled by the location effect)
    if (debounceControl.current) {
      clearTimeout(debounceControl.current)
      debounceControl.current = null
    }

    debounceControl.current = setTimeout(async () => {
      // if ()
      try {
        await setTree({
          id: treeId,
          name: dataToWrite.current.name || formData.name,
          description: dataToWrite.current.description || formData.description,
          lat: formData.location?.lat || props.lat || 0,
          lng: formData.location?.lng || props.lng || 0,
          // Preserve existing status or default to draft for new trees
          status: props.tree?.status || existingTreeRef.current?.status || 'draft'
        })
        // Clear the data to write after successful save
        dataToWrite.current = {}
      } catch (error) {
        console.error('[PlaceTreeForm] Failed to save tree:', error)
      }
    }, 400)
  }, [treeId, props.lat, props.lng, setTree])

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
      showToast({
        message: 'Tree bed created successfully',
        type: 'success'
      })
      props.onClose?.()
    } catch (err) {
      console.error("Failed to create tree bed:", err)
      showToast({
        message: 'Failed to create tree bed',
        type: 'error'
      })
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
      <div className="space-y-6">
        <div>
          <LocationInfoCard
            isLoading={isLoadingLocation}
            location={formData.location}
            locationInfo={formData.locationInfo || props.info}
          />
        </div>

        {formData.location && (
          <div>
            <StreetViewCard
              lat={formData.location.lat}
              lng={formData.location.lng}
              heading={existingTreeRef.current?._view_heading}
              pitch={existingTreeRef.current?._view_pitch}
              zoom={existingTreeRef.current?._view_zoom}
              isLoading={isLoadingLocation}
            />
          </div>
        )}

        <div className="space-y-0">
          <div>
            <input
              type="text"
              id="name"
              value={formData.name}
              onChange={(e) => handleFormChange({ name: e.target.value })}
              className={cn(
                "input w-full text-lg py-4 px-6 rounded-b-none",
                isReadOnly && "cursor-default"
              )}
              placeholder="Tree bed name"
              required
              readOnly={isReadOnly}
            />
          </div>

          <div>
            <textarea
              id="description"
              value={formData.description}
              onChange={(e) => handleFormChange({ description: e.target.value })}
              rows={3}
              className={cn(
                "input w-full px-6 rounded-t-none pt-6 border-t-0",
                isReadOnly && "cursor-default"
              )}
              placeholder="Describe the tree bed location and any special care instructions..."
              required
              readOnly={isReadOnly}
            />
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => {
            props.onClose?.()
          }}
          disabled={isPending}
          className="flex-1 rounded-lg frosted-glass focus-visible:outline-none focus-visible:ring-zinc-300 dark:focus-visible:ring-zinc-100 hover:ring-zinc-300 dark:hover:ring-zinc-100 h-12 flex items-center justify-center text-zinc-800 dark:text-zinc-100 text-xl disabled:cursor-not-allowed disabled:hover:ring-0"
          aria-label="Close"
        >
          <i className="fa-solid fa-xmark transition-opacity" aria-hidden="true" />
        </button>
        {!isReadOnly && (
          <button
            type="submit"
            disabled={!formData.location || !formData.name || !formData.description || isPending}
            className="flex-1 rounded-lg bg-emerald-500 hover:bg-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 h-12 flex items-center justify-center text-white text-xl disabled:cursor-not-allowed disabled:bg-emerald-500/50"
            aria-label="Create Tree"
          >
            <i className={`fa-solid ${isPending ? 'fa-circle-notch fa-spin' : !formData.location ? 'fa-location-dot' : !formData.name || !formData.description ? 'fa-pen' : 'fa-check'} transition-opacity`} aria-hidden="true" />
          </button>
        )}
      </div>
    </form>
  )
} 