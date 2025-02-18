'use client'

import { useRouter } from 'next/navigation'
import { useState, useRef, useCallback, useEffect } from 'react'
import type { LocationInfo } from '@/types/types'
import type { Tree, TreeStatus } from '@/server/routers/tree-router'
import { StepFormDialog } from '../ui/step-form-dialog'
import { LocationInfoCard } from './components/location-info-card'
import { useToast } from '@/app/components/toast'
import { useLiveTrees } from '@/hooks/use-tree-sockets'
import { useParams } from 'next/navigation'
import { client } from '@/lib/client'
import { useAuth } from '@clerk/nextjs'
import { StreetViewCard } from './components/street-view-card'
import { useStreetViewValidation } from '@/hooks/use-street-view-validation'

interface TreeFormData {
  name: string
  description: string
  location: {
    lat: number
    lng: number
  } | null
  locationInfo?: LocationInfo
  viewParams?: {
    heading: number
    pitch: number
    zoom: number
  }
}

export function TreeDialog(props: {
  lat?: number
  lng?: number
  info?: LocationInfo
  tree?: Tree
  userId: string
}) {
  const router = useRouter()
  const params = useParams()
  const treeId = params.treeId as string
  const { setTree, isPending } = useLiveTrees()
  const { show: showToast } = useToast()
  const [open, setOpen] = useState(true)
  const [currentStep, setCurrentStep] = useState(0)
  const [formData, setFormData] = useState<TreeFormData>({
    name: props.info?.address?.street || "",
    description: "",
    location: props.lat && props.lng ? { lat: props.lat, lng: props.lng } : null,
    locationInfo: props.info,
    viewParams: {
      heading: props.tree?._view_heading || 0,
      pitch: props.tree?._view_pitch || 0,
      zoom: props.tree?._view_zoom || 1
    }
  })

  // Redirect if no userId
  useEffect(() => {
    if (!props.userId) {
      showToast({
        message: 'Please sign in to create a project',
        type: 'error'
      })
      router.push('/projects')
    }
  }, [props.userId, router, showToast])

  // Log initial form data
  useEffect(() => {
    console.log('[TreeDialog] Initial form data:', formData)
    console.log('[TreeDialog] Initializing with props:', {
      lat: props.lat,
      lng: props.lng,
      info: props.info,
      tree: props.tree
    })
  }, [])

  const [isLoadingLocation, setIsLoadingLocation] = useState(false)
  const { deleteTree } = useLiveTrees()
  const debounceControl = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dataToWrite = useRef<Partial<TreeFormData>>({})

  // Log state changes
  useEffect(() => {
    console.log('[TreeDialog] Form data updated:', formData)
  }, [formData])

  useEffect(() => {
    console.log('[TreeDialog] Current step:', currentStep)
  }, [currentStep])

  useEffect(() => {
    console.log('[TreeDialog] Loading location state:', isLoadingLocation)
  }, [isLoadingLocation])

  const handleClose = () => {
    console.log('[TreeDialog] Closing dialog')
    setOpen(false)
    // Wait for the animation to complete
    setTimeout(() => {
      console.log('[TreeDialog] Navigating to /projects')
      router.push('/projects')
    }, 150)
  }

  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    console.log('[TreeDialog] Attempting to delete tree:', treeId)
    try {
      setIsDeleting(true)
      await deleteTree({ id: treeId })
      console.log('[TreeDialog] Successfully deleted tree:', treeId)
      handleClose()
    } catch (err) {
      console.error('[TreeDialog] Failed to delete tree:', err)
      showToast({
        message: 'Something went wrong when deleting the project',
        type: 'error'
      })
    } finally {
      setIsDeleting(false)
    }
  }

  const handleCancel = () => {
    console.log('[TreeDialog] Cancel clicked')
    handleClose()
  }

  const handleSaveAsDraft = async () => {
    console.log('[TreeDialog] Attempting to save as draft:', {
      formData,
      treeId
    })
    
    if (!formData.location) {
      console.log('[TreeDialog] Cannot save as draft: no location data')
      return
    }

    try {
      const payload = {
        id: treeId,
        name: formData.name || 'Untitled Tree Bed',
        description: formData.description,
        lat: formData.location.lat,
        lng: formData.location.lng,
        status: 'draft' as TreeStatus
      }
      console.log('[TreeDialog] Saving draft with payload:', payload)
      
      await setTree(payload)
      console.log('[TreeDialog] Successfully saved as draft')
      
      showToast({
        message: 'Tree bed saved as draft',
        type: 'success'
      })
      handleClose()
    } catch (err) {
      console.error('[TreeDialog] Failed to save as draft:', err)
      showToast({
        message: 'Failed to save as draft',
        type: 'error'
      })
    }
  }


  const handleFormChange = useCallback(async (changes: Partial<TreeFormData>) => {
    console.log('[TreeDialog] Form change received:', changes)
    console.log('[TreeDialog] Current form data:', formData)
    console.log('[TreeDialog] Current dataToWrite:', dataToWrite.current)
    
    setFormData(prev => {
      const updated = { ...prev, ...changes }
      console.log('[TreeDialog] Updated form data:', updated)
      return updated
    })
    
    dataToWrite.current = { ...dataToWrite.current, ...changes }
    console.log('[TreeDialog] Updated dataToWrite:', dataToWrite.current)

    // Only sync non-location changes immediately
    // (location changes are handled by the location effect)
    if (debounceControl.current) {
      console.log('[TreeDialog] Clearing existing debounce timeout')
      clearTimeout(debounceControl.current)
      debounceControl.current = null
    }

    debounceControl.current = setTimeout(async () => {
      try {
        const payload = {
          id: treeId,
          name: dataToWrite.current.name || formData.name,
          description: dataToWrite.current.description || formData.description,
          lat: formData.location?.lat || props.lat || 0,
          lng: formData.location?.lng || props.lng || 0,
          status: (props.tree?.status || 'draft') as TreeStatus
        }
        console.log('[TreeDialog] Saving changes to server with payload:', payload)
        
        await setTree(payload)
        console.log('[TreeDialog] Successfully saved changes to server')
        
        // Clear the data to write after successful save
        dataToWrite.current = {}
        console.log('[TreeDialog] Cleared dataToWrite after save')
      } catch (error) {
        console.error('[TreeDialog] Failed to save changes:', error)
      }
    }, 400)
  }, [formData, treeId, props.lat, props.lng, setTree, props.tree?.status])

  const handlePositionChange = useCallback((lat: number, lng: number) => {
    console.log('[TreeDialog] Street view position changed:', { lat, lng })
    const isEqual = lat === formData.location?.lat && lng === formData.location?.lng
    if (isEqual) {
      console.log('[TreeDialog] Position unchanged, skipping update')
      return
    }
    handleFormChange({ location: { lat, lng } })
  }, [formData])

  const { validateStreetView, isValidating } = useStreetViewValidation({
    projectId: treeId,
    fundraiserId: props.userId,
    onSuccess: (response) => {
      if (response.params) {
        handleFormChange({
          viewParams: {
            heading: response.params.heading,
            pitch: response.params.pitch,
            zoom: response.params.zoom
          }
        })
      }
    }
  })

  const handleSubmit = async () => {
    console.log('[TreeDialog] Attempting to submit form:', {
      formData,
      treeId
    })
    
    if (!formData.location) {
      console.log('[TreeDialog] Cannot submit: no location data')
      return
    }

    try {
      const payload = {
        id: treeId,
        name: formData.name,
        description: formData.description,
        lat: formData.location.lat,
        lng: formData.location.lng,
        status: 'live' as TreeStatus,
        _view_heading: formData.viewParams?.heading,
        _view_pitch: formData.viewParams?.pitch,
        _view_zoom: formData.viewParams?.zoom
      }
      console.log('[TreeDialog] Submitting with payload:', payload)
      
      await setTree(payload)
      console.log('[TreeDialog] Successfully submitted tree')
      
      showToast({
        message: 'Tree bed created successfully',
        type: 'success'
      })
      handleClose()
    } catch (err) {
      console.error('[TreeDialog] Failed to create tree bed:', err)
      showToast({
        message: 'Failed to create tree bed',
        type: 'error'
      })
    }
  }

  const steps = [
    {
      title: "Let's start a project",
      style: {
        fullHeight: true
      },
      content: (
        <LocationInfoCard
          location={formData.location}
          locationInfo={formData.locationInfo}
          isLoading={isLoadingLocation || !props.userId}
        >
          {formData.location && (
            <StreetViewCard
              lat={formData.location.lat}
              lng={formData.location.lng}
              heading={formData.viewParams?.heading}
              pitch={formData.viewParams?.pitch}
              zoom={formData.viewParams?.zoom}
              isLoading={isLoadingLocation || !props.userId}
              projectId={treeId}
              fundraiserId={props.userId}
              className="rounded-lg mt-[-140px] overflow-hidden rounded-xl!"
              onPositionChange={handlePositionChange}
              onValidationSuccess={(response) => {
                if (response.params) {
                  handleFormChange({
                    viewParams: {
                      heading: response.params.heading,
                      pitch: response.params.pitch,
                      zoom: response.params.zoom
                    }
                  })
                }
              }}
            />
          )}
        </LocationInfoCard>
      )
    },
    {
      title: "Add Details",
      content: (
        <div className="space-y-0">
          <div>
            <input
              type="text"
              id="name"
              value={formData.name}
              onChange={(e) => {
                console.log('[TreeDialog] Name input changed:', e.target.value)
                handleFormChange({ name: e.target.value })
              }}
              className="input w-full text-lg py-4 px-6 rounded-b-none"
              placeholder="Tree bed name"
              required
            />
          </div>
          <div>
            <textarea
              id="description"
              value={formData.description}
              onChange={(e) => {
                console.log('[TreeDialog] Description input changed:', e.target.value)
                handleFormChange({ description: e.target.value })
              }}
              rows={3}
              className="input w-full px-6 rounded-t-none pt-6 border-t-0"
              placeholder="Describe the tree bed location and any special care instructions..."
              required
            />
          </div>
        </div>
      )
    }
  ]

  const canSubmit = Boolean(
    formData.location &&
    formData.name.trim() &&
    formData.description.trim()
  )

  // Log submission state
  useEffect(() => {
    console.log('[TreeDialog] Submit state:', {
      canSubmit,
      isPending,
      isDeleting
    })
  }, [canSubmit, isPending, isDeleting])

  return (
    <StepFormDialog
      open={open}
      onOpenChange={(newOpen) => {
        console.log('[TreeDialog] Dialog open state changing to:', newOpen)
        setOpen(newOpen)
      }}
      steps={steps}
      currentStep={currentStep}
      onStepChange={(step) => {
        console.log('[TreeDialog] Step changing to:', step)
        setCurrentStep(step)
      }}
      onClose={handleClose}
      onCancel={handleDelete}
      onSubmit={handleSubmit}
      isSubmitting={isPending}
      canSubmit={canSubmit}
      cancelAction={{
        type: 'draft-or-delete',
        draftTitle: 'Keep draft',
        deleteTitle: 'Delete',
        subtitle: 'Would you like to keep this tree bed as a draft or delete it?',
        onSaveAsDraft: handleSaveAsDraft,
        isDeleting
      }}
    />
  )
} 