'use client'

import { useRouter } from 'next/navigation'
import { useState, useRef, useCallback, useEffect } from 'react'
import type { LocationInfo, ProjectCategory } from '@/types/types'
import type { ProjectData, ProjectStatus, ProjectCostBreakdown, CostBreakdown } from '@/server/types/shared'
import { StepFormDialog, StepFormDialogStep } from '../ui/step-form-dialog'
import { LocationInfoCard } from './components/location-info-card'
import { useToast } from '@/app/components/toast'
import { Project, useLiveTrees, useProjectData } from '@/hooks/use-tree-sockets'
import { useParams } from 'next/navigation'
import { StreetViewCard } from './components/street-view-card'
import { ProjectDetails } from './components/project-details'
import { ProjectSuggestions } from './components/project-suggestions'
import { useDebouncedCallback } from '@/hooks/use-debounce'
import { Carousel } from '@/app/components/ui/carousel'
import { calculateProjectCosts, formatCurrency } from '@/lib/cost'

type ProjectSuggestion = NonNullable<ProjectData['suggestions']>[number]

export interface ProjectFormData {
  id: string
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
  suggestion?: ProjectSuggestion
  category?: string
  cost_breakdown?: ProjectCostBreakdown | CostBreakdown
  _meta_created_by?: string
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
  const {
    projectData,
    disconnect
  } = useProjectData(projectId)

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
    id: projectId,
    name: props.info?.address?.street || "",
    description: "",
    location: props.lat && props.lng ? { lat: props.lat, lng: props.lng } : null,
    locationInfo: props.info,
    viewParams: {
      heading: props.project?._view_heading || 0,
      pitch: props.project?._view_pitch || 0,
      zoom: props.project?._view_zoom || 1
    },
    category: props.project?.category,
    cost_breakdown: props.project?.cost_breakdown
  })

  // Redirect if no userId
  useEffect(() => {
    if (!props.userId) {
      showToast({
        message: 'Please sign in to create a project',
        type: 'error'
      })
      router.push('/sign-in')
    }
  }, [props.userId, router, showToast])

  const handleClose = () => {
    console.log('[TreeDialog] Closing dialog')
    setOpen(false)
    disconnect()
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
      const payload: ProjectData['project'] & {
        lat: number
        lng: number
      } = {
        ...projectData.data.project,
        id: projectId,
        name: formData.name,
        description: formData.description,
        status: 'active' as ProjectStatus,
        _view_heading: formData.viewParams?.heading,
        _view_pitch: formData.viewParams?.pitch,
        _view_zoom: formData.viewParams?.zoom,
        source_suggestion_id: formData.suggestion?.id,
        category: formData.suggestion?.category || 'other',
        cost_breakdown: formData.cost_breakdown,
        lat: formData.location.lat,
        lng: formData.location.lng,
        _loc_lat: formData.location.lat,
        _loc_lng: formData.location.lng,
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

  const handleProjectFormUpdate = useCallback(async (updates: Partial<ProjectFormData>, immediate?: boolean) => {
    console.log('[TreeDialog] Handling project form update:', updates)
    
    // Merge updates with current form data
    const mergedData = {
      ...formData,
      ...updates,
    }
    setFormData(mergedData)

    // Only save if we have location data
    if (!mergedData.location) {
      console.log('[TreeDialog] Skipping save: no location data')
      return
    }

    if (immediate) {
      saveProjectCallback(mergedData)
    } else {
      debouncedSaveProject(mergedData)
    }
  }, [formData])

  const saveProject = async (mergedData: ProjectFormData) => {
    try {
      const payload: ProjectData['project'] & {
        lat: number
        lng: number
      } = {
        ...projectData.data.project,
        id: projectId,
        name: mergedData.name || 'Untitled Project',
        description: mergedData.description,
        lat: mergedData.location?.lat ?? 0,
        lng: mergedData.location?.lng ?? 0,
        status: 'draft' as ProjectStatus,
        _view_heading: mergedData.viewParams?.heading,
        _view_pitch: mergedData.viewParams?.pitch,
        _view_zoom: mergedData.viewParams?.zoom,
        source_suggestion_id: mergedData.suggestion?.id,
        cost_breakdown: mergedData.cost_breakdown
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
  }
  
  const saveProjectCallback = useCallback(
    saveProject,
    [projectData, projectId, setProject, showToast]
  );

  // Create a debounced version of the save project function
  const debouncedSaveProject = useDebouncedCallback(
    saveProject,
    2000,
    [projectData, projectId, setProject, showToast]
  )

  const handleSuggestionSelect = useCallback((suggestion: NonNullable<ProjectData['suggestions']>[number] | null) => {
    console.log('[TreeDialog] Selected suggestion:', suggestion)
    if (!suggestion) {
      setFormData(prev => ({
        ...prev,
        suggestion: undefined,
        estimated_cost: undefined
      }))
      return
    }
    setFormData(prev => ({
      ...prev,
      name: suggestion.title || '',
      description: suggestion.summary || '',
      suggestion: suggestion,
      estimated_cost: suggestion.estimatedCost ? {
        total: suggestion.estimatedCost.total,
        breakdown: suggestion.estimatedCost.breakdown
      } : undefined
    }))

    handleProjectFormUpdate({
      ...formData,
      name: suggestion.title || '',
      description: suggestion.summary || '',
      suggestion: suggestion
    })
    
    // Automatically move to the next step
    setCurrentStep(currentStep + 1)
  }, [currentStep])

  const handleStepChange = useCallback((newStep: number) => {
    console.log('[TreeDialog] Step changing to:', newStep)
    
    setCurrentStep(newStep)
  }, [currentStep, formData.suggestion, handleProjectFormUpdate])

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
      const payload: ProjectData['project'] & {
        lat: number
        lng: number
      } = {
        ...projectData.data.project,
        id: projectId,
        name: formData.name || 'Untitled Project',
        description: formData.description,
        lat: formData.location.lat,
        lng: formData.location.lng,
        status: 'draft' as ProjectStatus,
        _view_heading: formData.viewParams?.heading,
        _view_pitch: formData.viewParams?.pitch,
        _view_zoom: formData.viewParams?.zoom,
        source_suggestion_id: formData.suggestion?.id,
        cost_breakdown: formData.cost_breakdown,
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

  // Helper function to display suggestion preview
  const SuggestionPreview = useCallback(() => {
    if (!formData.suggestion) return null
    
    const suggestion = formData.suggestion
    const costs = calculateProjectCosts(suggestion.estimatedCost?.breakdown)
    
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {suggestion.title}
          </h3>
          
          {/* Image preview */}
          {suggestion.images && (
            <div className="w-full relative rounded-lg overflow-hidden">
              <Carousel 
                images={
                  suggestion.images.generated?.map(img => ({
                    src: img.url,
                    alt: `${suggestion.title} - Imagined view`,
                    label: 'Imagined'
                  })) || []
                }
                showControls={true}
                showIndicators={true}
                autoPlay={false}
              />
            </div>
          )}
          
          {/* Details */}
          <div className="frosted-glass p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {suggestion.category?.replace(/_/g, ' ')}
                </span>
              </div>
              <span className="text-sm font-medium text-accent">
                {costs?.total ? formatCurrency(costs.total) : 'Cost estimate unavailable'}
              </span>
            </div>
            
            <p className="text-gray-600 dark:text-gray-300 leading-relaxed text-sm">
              {suggestion.summary}
            </p>
            
            {costs && (
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="flex justify-between font-medium text-gray-900 dark:text-gray-100">
                  <span>Total Estimated Cost</span>
                  <span className="tabular-nums">{formatCurrency(costs.total)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }, [formData.suggestion])

  const steps: StepFormDialogStep[] = [ 
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
      title: "Browse project ideas",
      content: (
        <ProjectSuggestions
          projectId={projectId}
          onSuggestionSelect={handleSuggestionSelect}
          isLoading={!formData.location || !formData.viewParams}
        />
      ),
      canProgress: Boolean(formData.suggestion)
    },
    {
      title: "Review your selection",
      content: <SuggestionPreview />,
      onSubmit: () => {
        const suggestion = formData.suggestion;
        return handleProjectFormUpdate({
          cost_breakdown: suggestion?.estimatedCost?.breakdown,
        }, true)
      },
      canProgress: Boolean(formData.suggestion)
    },
    {
      title: "Project details",
      style: {
        hideHeader: true
      },
      content: (
        <ProjectDetails
          initialData={formData}
          projectId={projectId}
          projectStatus={props.project?.status || 'draft'}
          onUpdateProject={handleProjectFormUpdate}
          isReadOnly={false}
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
        onSaveAsDraft: () => {
          saveDraft()
          handleClose()
        },
        onDelete: handleDelete,
        isDeleting
      }}
    />
  )
} 