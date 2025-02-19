'use client'

import { useState, useEffect, useCallback, useRef } from "react"
import { useMap } from "@/hooks/use-map"
import { Project, useLiveTrees } from "../../../hooks/use-tree-sockets"
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
  project?: Project
  onClose?: () => void
}) => {
  const router = useRouter()
  const params = useParams()
  const projectId = params.treeId as string
  const { map, isLoaded, error } = useMap()
  const { setProject, isPending, projectMap } = useLiveTrees()
  const { show: showToast } = useToast()
  const isReadOnly = props.project?.status === 'active'

  // Add initialization tracking
  const [isInitialized, setIsInitialized] = useState(false)
  const existingProjectRef = useRef<typeof projectMap.get extends (key: any) => infer R ? R : never>(
    projectMap.get(projectId) || props.project
  )

  // Form state
  const [formData, setFormData] = useState<TreeBedFormData>({
    name: existingProjectRef.current?.name || props.info?.address?.street || "",
    description: existingProjectRef.current?.description || "",
    location: null  // Start with no location to prevent premature updates
  })
  const [isLoadingLocation, setIsLoadingLocation] = useState(false)
  
  // Load or initialize tree data
  useEffect(() => {
    const existingProject = projectMap.get(projectId)
    console.log('[PlaceTreeForm] existingProject', existingProject)
    
    // Store the existing tree reference for use in other effects
    existingProjectRef.current = existingProject || undefined
    
    const initializeProject = async () => {
      if (existingProject) {
        console.log('[PlaceTreeForm] Loading existing project:', existingProject.id)
        // Load existing project data
        setFormData({
          name: existingProject.name,
          description: existingProject.description || "",
          location: { 
            lat: existingProject._loc_lat,
            lng: existingProject._loc_lng
          }
        })
      } else if (props.lat && props.lng && !isInitialized) {
        // Only initialize new project with coordinates if not already initialized
        console.log('[PlaceTreeForm] Initializing new project with coordinates')
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

    initializeProject()
  }, [projectMap, projectId, props.lat, props.lng])

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

        // Only set status to draft for new projects
        const status = props.project?.status
          || existingProjectRef.current?.status
          || 'draft'

        // Sync with server
        await setProject({
          id: projectId,
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
  }, [formData.location, props.info, projectId, setProject])

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
        await setProject({
          id: projectId,
          name: dataToWrite.current.name || formData.name,
          description: dataToWrite.current.description || formData.description,
          lat: formData.location?.lat || props.lat || 0,
          lng: formData.location?.lng || props.lng || 0,
          // Preserve existing status or default to draft for new projects
          status: props.project?.status || existingProjectRef.current?.status || 'draft'
        })
        // Clear the data to write after successful save
        dataToWrite.current = {}
      } catch (error) {
        console.error('[PlaceTreeForm] Failed to save project:', error)
      }
    }, 400)
  }, [projectId, props.lat, props.lng, setProject])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!map || !formData.location) return
    
    try {
      await setProject({
        id: projectId,
        name: formData.name,
        lat: formData.location.lat,
        lng: formData.location.lng,
        status: 'active'
      })
      showToast({
        message: 'Project created successfully',
        type: 'success'
      })
      props.onClose?.()
    } catch (err) {
      console.error("Failed to create project:", err)
      showToast({
        message: 'Failed to create project',
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
            projectId={projectId}
            isLoading={isLoadingLocation}
            location={formData.location}
            locationInfo={formData.locationInfo || props.info}
          />
        </div>

        {formData.location && (
          <div>
            <StreetViewCard
              projectId={projectId}
              lat={formData.location.lat}
              lng={formData.location.lng}
              heading={existingProjectRef.current?._view_heading}
              pitch={existingProjectRef.current?._view_pitch}
              zoom={existingProjectRef.current?._view_zoom}
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