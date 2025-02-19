'use client'

import { useRouter } from 'next/navigation'
import { useState, useRef, useCallback, useEffect } from 'react'
import type { LocationInfo } from '@/types/types'
import type { Project, ProjectStatus } from '@/server/routers/tree-router'
import { StepFormDialog } from '../ui/step-form-dialog'
import { LocationInfoCard } from './components/location-info-card'
import { useToast } from '@/app/components/toast'
import { useLiveTrees, useProjectData } from '@/hooks/use-tree-sockets'
import { useParams } from 'next/navigation'
import { StreetViewCard } from './components/street-view-card'
import { ProjectForm } from './components/project-form'
import { ProjectSuggestions } from './components/project-suggestions'

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
  suggestion?: {
    title: string
    summary: string
    imagePrompt: string
    generatedImageUrl?: string
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
  const projectData = useProjectData(projectId)

  // Update form data when project data changes
  useEffect(() => {
    if (projectData?.data) {
      console.log('[TreeDialog] Received project data update:', projectData?.data)
      setFormData(prev => ({
        ...prev,
        name: projectData.data.project.name || prev.name,
        description: projectData.data.project.description || prev.description,
        location: projectData.data.project._loc_lat && projectData.data.project._loc_lng
          ? {
              lat: projectData.data.project._loc_lat,
              lng: projectData.data.project._loc_lng
            }
          : prev.location,
        viewParams: {
          heading: projectData.data.project._view_heading || prev.viewParams?.heading || 0,
          pitch: projectData.data.project._view_pitch || prev.viewParams?.pitch || 0,
          zoom: projectData.data.project._view_zoom || prev.viewParams?.zoom || 1
        }
      }))
    }
  }, [projectData])

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

  const handleProjectFormUpdate = useCallback(async (updates: Partial<ProjectFormData>) => {
    console.log('[TreeDialog] Handling project form update:', updates)
    
    // Merge updates with current form data
    const mergedData = {
      ...formData,
      ...updates
    }
    setFormData(mergedData)

    // Only save if we have location data
    if (!mergedData.location) {
      console.log('[TreeDialog] Skipping save: no location data')
      return
    }

    try {
      const payload = {
        id: projectId,
        name: mergedData.name || 'Untitled Project',
        description: mergedData.description,
        lat: mergedData.location.lat,
        lng: mergedData.location.lng,
        status: 'draft' as ProjectStatus,
        _view_heading: mergedData.viewParams?.heading,
        _view_pitch: mergedData.viewParams?.pitch,
        _view_zoom: mergedData.viewParams?.zoom
      }
      console.log('[TreeDialog] Saving update with payload:', payload)
      
      await setProject(payload)
      console.log('[TreeDialog] Successfully saved update')
    } catch (err) {
      console.error('[TreeDialog] Failed to save update:', err)
      showToast({
        message: 'Failed to save changes',
        type: 'error'
      })
    }
  }, [formData, projectId, setProject, showToast])

  const handleSuggestionSelect = useCallback((suggestion: ProjectFormData['suggestion']) => {
    console.log('[TreeDialog] Selected suggestion:', suggestion)
    setFormData(prev => ({
      ...prev,
      name: suggestion?.title || '',
      description: suggestion?.summary || '',
      suggestion: suggestion
    }))
  }, [])

  const saveDraft = useCallback(async (silent?: boolean) => {
    console.log('[TreeDialog] Saving draft:', {
      formData,
      projectId
    })
    
    if (!formData.location) {
      console.log('[TreeDialog] Cannot save draft: no location data')
      return
    }

    try {
      const payload = {
        id: projectId,
        name: formData.name || 'Untitled Project',
        description: formData.description,
        lat: formData.location.lat,
        lng: formData.location.lng,
        status: 'draft' as ProjectStatus,
        _view_heading: formData.viewParams?.heading,
        _view_pitch: formData.viewParams?.pitch,
        _view_zoom: formData.viewParams?.zoom
      }
      console.log('[TreeDialog] Saving draft with payload:', payload)
      
      await setProject(payload)
      console.log('[TreeDialog] Successfully saved draft')
      
      if (!silent) {
        showToast({
          message: 'Progress saved',
          type: 'success',
          position: 'top'
        })
      }
    } catch (err) {
      console.error('[TreeDialog] Failed to save draft:', err)
      showToast({
        message: 'Failed to save progress',
        type: 'error'
      })
    }
  }, [formData, projectId, setProject, showToast])

  const handleStepChange = useCallback((newStep: number) => {
    console.log('[TreeDialog] Step changing to:', newStep)
    // Save draft when moving to next step
    if (newStep > currentStep) {
      saveDraft()
    }
    setCurrentStep(newStep)
  }, [currentStep, saveDraft])

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
          projectId={projectId}
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
              saveDraft={() => saveDraft(true)}
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
        || (projectData.data?.images?.length ?? 0) > 0
    },
    {
      title: "Choose a Project Type",
      content: (
        <ProjectSuggestions
          projectId={projectId}
          currentImageUrl={`https://maps.googleapis.com/maps/api/streetview?size=600x400&location=${formData.location?.lat},${formData.location?.lng}&heading=${formData.viewParams?.heading}&pitch=${formData.viewParams?.pitch}&fov=${90/(formData.viewParams?.zoom || 1)}&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`}
          onSuggestionSelect={handleSuggestionSelect}
          isLoading={!formData.location || !formData.viewParams}
        />
      ),
      canProgress: Boolean(formData.suggestion)
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
      onStepChange={handleStepChange}
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
        onSaveAsDraft: saveDraft,
        onDelete: handleDelete,
        isDeleting
      }}
    />
  )
} 