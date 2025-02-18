'use client'

import { useRouter } from 'next/navigation'
import { useState, useRef, useCallback, useEffect } from 'react'
import type { LocationInfo } from '@/types/types'
import type { Project, ProjectStatus } from '@/server/routers/tree-router'
import { StepFormDialog } from '../ui/step-form-dialog'
import { LocationInfoCard } from './components/location-info-card'
import { useToast } from '@/app/components/toast'
import { useLiveTrees } from '@/hooks/use-tree-sockets'
import { useParams } from 'next/navigation'
import { client } from '@/lib/client'
import { useAuth } from '@clerk/nextjs'
import { StreetViewCard } from './components/street-view-card'
import { useStreetViewValidation } from '@/hooks/use-street-view-validation'
import { ProjectForm } from './components/project-form'

interface ProjectFormData {
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
  project?: Project
  userId: string
}) {
  const router = useRouter()
  const params = useParams()
  const projectId = params.treeId as string
  const { setProject, isPending, deleteProject } = useLiveTrees()
  const { show: showToast } = useToast()
  const [open, setOpen] = useState(true)
  const [currentStep, setCurrentStep] = useState(0)
  const [isLocationValid, setIsLocationValid] = useState(false)
  const [formData, setFormData] = useState<ProjectFormData>({
    name: props.info?.address?.street || "",
    description: "",
    location: props.lat && props.lng ? { lat: props.lat, lng: props.lng } : null,
    locationInfo: props.info,
    viewParams: {
      heading: props.project?._view_heading || 0,
      pitch: props.project?._view_pitch || 0,
      zoom: props.project?._view_zoom || 1
    }
  })

  // Refs for debouncing
  const debounceControl = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dataToWrite = useRef<Partial<Project>>({})

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
    console.log('[TreeDialog] Attempting to delete project:', projectId)
    try {
      setIsDeleting(true)
      await deleteProject({ id: projectId })
      console.log('[TreeDialog] Successfully deleted project:', projectId)
      handleClose()
    } catch (err) {
      console.error('[TreeDialog] Failed to delete project:', err)
      showToast({
        message: 'Something went wrong when deleting the project',
        type: 'error'
      })
    } finally {
      setIsDeleting(false)
    }
  }

  const handleSaveAsDraft = async () => {
    console.log('[TreeDialog] Attempting to save as draft:', {
      formData,
      projectId
    })
    
    if (!formData.location) {
      console.log('[TreeDialog] Cannot save as draft: no location data')
      return
    }

    try {
      const payload = {
        id: projectId,
        name: formData.name || 'Untitled Project',
        description: formData.description,
        lat: formData.location.lat,
        lng: formData.location.lng,
        status: 'draft' as ProjectStatus
      }
      console.log('[TreeDialog] Saving draft with payload:', payload)
      
      await setProject(payload)
      console.log('[TreeDialog] Successfully saved as draft')
      
      showToast({
        message: 'Project saved as draft',
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

  const handleSubmit = async () => {
    console.log('[TreeDialog] Attempting to submit form:', {
      formData,
      projectId
    })
    
    if (!formData.location) {
      console.log('[TreeDialog] Cannot submit: no location data')
      return
    }

    try {
      const payload = {
        id: projectId,
        name: formData.name,
        description: formData.description,
        lat: formData.location.lat,
        lng: formData.location.lng,
        status: 'active' as ProjectStatus,
        _view_heading: formData.viewParams?.heading,
        _view_pitch: formData.viewParams?.pitch,
        _view_zoom: formData.viewParams?.zoom
      }
      console.log('[TreeDialog] Submitting with payload:', payload)
      
      await setProject(payload)
      console.log('[TreeDialog] Successfully submitted project')
      
      showToast({
        message: 'Project created successfully',
        type: 'success'
      })
      handleClose()
    } catch (err) {
      console.error('[TreeDialog] Failed to create project:', err)
      showToast({
        message: 'Failed to create project',
        type: 'error'
      })
    }
  }

  const handleProjectFormUpdate = useCallback((updates: Partial<Project>) => {
    console.log('[TreeDialog] Received form update:', updates)
    
    // Update the accumulated changes
    dataToWrite.current = { ...dataToWrite.current, ...updates }
    console.log('[TreeDialog] Updated dataToWrite:', dataToWrite.current)

    // Merge updates with current form data immediately for UI
    setFormData(prev => ({
      ...prev,
      ...updates
    }))

    // Clear existing timeout
    if (debounceControl.current) {
      console.log('[TreeDialog] Clearing existing debounce timeout')
      clearTimeout(debounceControl.current)
      debounceControl.current = null
    }

    // Set new timeout for server update
    debounceControl.current = setTimeout(async () => {
      try {
        // Prepare and send the complete project update
        const payload = {
          id: projectId,
          name: dataToWrite.current.name ?? formData.name,
          description: dataToWrite.current.description ?? formData.description,
          lat: dataToWrite.current._loc_lat ?? formData.location?.lat ?? 0,
          lng: dataToWrite.current._loc_lng ?? formData.location?.lng ?? 0,
          status: dataToWrite.current.status ?? props.project?.status ?? 'draft',
          _view_heading: dataToWrite.current._view_heading ?? formData.viewParams?.heading ?? 0,
          _view_pitch: dataToWrite.current._view_pitch ?? formData.viewParams?.pitch ?? 0,
          _view_zoom: dataToWrite.current._view_zoom ?? formData.viewParams?.zoom ?? 1
        }

        console.log('[TreeDialog] Sending debounced update to server:', payload)
        await setProject(payload)
        console.log('[TreeDialog] Successfully sent update to server')
        
        // Clear the accumulated changes after successful update
        dataToWrite.current = {}
      } catch (error) {
        console.error('[TreeDialog] Failed to send update to server:', error)
      }
    }, 400)
  }, [formData, projectId, props.project?.status, setProject])

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
          isLoading={!props.userId}
        >
          {formData.location && (
            <StreetViewCard
              lat={formData.location.lat}
              lng={formData.location.lng}
              heading={formData.viewParams?.heading}
              pitch={formData.viewParams?.pitch}
              zoom={formData.viewParams?.zoom}
              isLoading={!props.userId}
              projectId={projectId}
              fundraiserId={props.userId}
              className="rounded-lg mt-[-140px] overflow-hidden rounded-xl!"
              onPositionChange={(lat, lng) => {
                setFormData(prev => ({
                  ...prev,
                  location: { lat, lng }
                }))
              }}
              onValidationStateChange={({ isValid }) => setIsLocationValid(isValid)}
              onValidationSuccess={(response) => {
                if (response.params) {
                  setFormData(prev => ({
                    ...prev,
                    viewParams: {
                      heading: response.params.heading,
                      pitch: response.params.pitch,
                      zoom: response.params.zoom
                    }
                  }))
                }
              }}
            />
          )}
        </LocationInfoCard>
      ),
      canProgress: isLocationValid
    },
    {
      title: "Add Details",
      content: (
        <ProjectForm
          initialData={formData}
          projectId={projectId}
          projectStatus={props.project?.status || 'draft'}
          onUpdateProject={handleProjectFormUpdate}
        />
      )
    }
  ]

  const canSubmit = Boolean(
    formData.location &&
    formData.name.trim() &&
    formData.description.trim()
  )

  return (
    <StepFormDialog
      open={open}
      onOpenChange={setOpen}
      steps={steps}
      currentStep={currentStep}
      onStepChange={setCurrentStep}
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
        onDelete: handleDelete,
        isDeleting
      }}
    />
  )
} 