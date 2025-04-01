import { useCallback, useState, useEffect, useRef, useMemo } from 'react'
import type { ProjectData, ProjectStatus, CostBreakdown, ProjectCostBreakdown } from '@/server/types/shared'
import { useLiveTrees } from '@/hooks/use-tree-sockets'
import { useProjectData } from '@/hooks/use-tree-sockets'
import type { ProjectFormData } from '../tree-dialog'
import { cn } from '@/lib/utils'
import { calculateProjectCosts, convertFlatToNestedCostBreakdown, convertNestedToFlatCostBreakdown } from '@/lib/cost'
import { CostEstimate } from './cost-estimate'
import { Carousel } from '@/app/components/ui/carousel'
import { UserAvatar } from '@/app/components/ui/user-avatar'
import { UserName } from '@/app/components/ui/user-name'
import { WebSocketManager } from '@/hooks/websocket-manager'

const categoryEmojis: Record<string, string> = {
  urban_greening: '🌳',
  park_improvement: '🏞️',
  community_garden: '🌱',
  playground: '🎪',
  public_art: '🎨',
  sustainability: '♻️',
  accessibility: '♿️',
  other: '✨'
}

type OnUpdateProject = Partial<Parameters<ReturnType<typeof useLiveTrees>['setProject']>[0]>

interface ProjectDetailsProps {
  initialData: ProjectFormData
  projectId: string
  projectStatus?: ProjectStatus
  onUpdateProject?: (data: OnUpdateProject) => void
  isReadOnly?: boolean
  isLoading?: boolean
}

type EditingField = 'name' | 'description' | null

interface ProjectImagesProps {
  projectId: string
  initialImages?: Array<{ src: string, stage: 'generated' | 'upscaled' | 'source', label: string }>
  isGenerating?: boolean
  isRegenerating?: boolean
}

function ProjectImages({ 
  projectId, 
  initialImages = [],
  isGenerating = false,
  isRegenerating = false
}: ProjectImagesProps) {
  const { projectData } = useProjectData(projectId)
  
  // Process images from projectData and fallback to initialImages if needed
  const images = useMemo(() => {
    // If we don't have project data yet, use the initial images
    if (!projectData?.data?.suggestions?.length) {
      return initialImages
    }
    
    // Find the active suggestion
    const suggestion = projectData.data.suggestions.find(
      s => s.id === projectData.data.project.source_suggestion_id
    )
    
    if (!suggestion?.images) return initialImages
    
    const processedImages: Array<{ src: string, stage: 'generated' | 'upscaled' | 'source', label: string }> = []
    
    if (suggestion.images.generated?.length) {
      suggestion.images.generated.forEach(image => {
        processedImages.push({ src: image.url, stage: 'generated', label: 'Imagined ✨' })
      })
    }
    
    if (suggestion.images.upscaled?.url) {
      processedImages.push({ 
        src: suggestion.images.upscaled.url, 
        stage: 'upscaled',
        label: 'Current' 
      })
    }
    
    if (!processedImages.length && suggestion.images.source?.url) {
      processedImages.push({ 
        src: suggestion.images.source.url, 
        stage: 'source', 
        label: 'Current' 
      })
    }
    
    return processedImages.length ? processedImages : initialImages
  }, [projectData, initialImages])
  
  // Check if any generating status exists in project data
  const isGeneratingFromData = useMemo(() => {
    if (!projectData?.data?.suggestions?.length) return isGenerating
    
    const suggestion = projectData.data.suggestions.find(
      s => s.id === projectData.data.project.source_suggestion_id
    )
    
    return suggestion?.images?.status?.isGenerating || isGenerating
  }, [projectData, isGenerating])
  
  if (!images.length) {
    return null
  }

  return (
    <div className="relative w-full mb-4">
      <div className="relative w-full pb-[100%] rounded-xl overflow-hidden">
        <div className="absolute inset-0">
          <Carousel
            images={images.map(img => ({
              src: img.src,
              alt: `Project image - ${img.stage}`,
              label: img.label
            }))}
            showControls={true}
            showIndicators={true}
            autoPlay={true}
          />
          {(isGeneratingFromData || isRegenerating) && (
            <div className="absolute rounded-xl inset-0 flex items-center justify-center bg-black/20 backdrop-blur-sm z-20">
              <div className="frosted-glass rounded-xl px-4 py-2 flex items-center gap-2">
                <i className="fa-solid fa-wand-magic-sparkles text-zinc-700 dark:text-zinc-300" />
                <span className="text-sm text-zinc-700 dark:text-zinc-300">
                  Generating image...
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function ProjectDetailsSkeleton() {
  return (
    <div className="space-y-0 pt-5">
      {/* Image Carousel Skeleton */}
      <div className="relative w-full mb-4">
        <div className="relative w-full pb-[100%] rounded-lg overflow-hidden">
          <div className="absolute inset-0 bg-gray-200 dark:bg-black/20 animate-pulse" />
        </div>
      </div>

      {/* Category Skeleton */}
      <div className="w-full pb-6">
        <div className="w-full rounded-xl bg-gray-200 dark:bg-black/20 animate-pulse h-10" />
      </div>

      {/* Title Skeleton */}
      <div className="pb-2">
        <div className="h-8 w-3/4 bg-gray-200 dark:bg-black/20 rounded animate-pulse" />
      </div>
    </div>
  )
}

export function ProjectDetails({ 
  initialData, 
  projectId, 
  projectStatus = 'draft', 
  onUpdateProject,
  isReadOnly = false,
  isLoading = false
}: ProjectDetailsProps) {
  const [name, setName] = useState(initialData.name)
  const [hasNameChanged, setHasNameChanged] = useState(false)
  
  // Reference to the initial values to detect changes
  const initialName = useRef(initialData.name)
  const initialDescription = useRef(initialData.description)
  const initialCosts = useRef<CostBreakdown | null>(null)
  const [hasEdits, setHasEdits] = useState(false)
  const [isRegenerating, setIsRegenerating] = useState(false)
  
  useEffect(() => {
    if (initialData.name === name) return;
    setName(initialData.name)
    initialName.current = initialData.name
    // Reset name change detection when receiving new data
    setHasNameChanged(false)
  }, [initialData.name])

  const [description, setDescription] = useState(initialData.description)
  const [hasDescriptionChanged, setHasDescriptionChanged] = useState(false)
  
  useEffect(() => {
    if (initialData.description === description) return;
    setDescription(initialData.description)
    initialDescription.current = initialData.description
    // Reset description change detection when receiving new data
    setHasDescriptionChanged(false)
  }, [initialData.description])

  const [editingField, setEditingField] = useState<EditingField>(null)
  const [costs, setCosts] = useState<CostBreakdown | null>(() => {
    if (initialData.cost_breakdown) {
      return calculateProjectCosts(initialData.cost_breakdown)
    }
    if (initialData.suggestion?.estimatedCost?.breakdown) {
      return calculateProjectCosts(initialData.suggestion.estimatedCost.breakdown)
    }
    return null
  })
  
  const [hasCostsChanged, setHasCostsChanged] = useState(false)

  // Update costs when initialData changes
  useEffect(() => {
    let updatedCosts = null;
    if (initialData.cost_breakdown) {
      updatedCosts = calculateProjectCosts(initialData.cost_breakdown);
    } else if (initialData.suggestion?.estimatedCost?.breakdown) {
      updatedCosts = calculateProjectCosts(initialData.suggestion.estimatedCost.breakdown);
    }
    
    if (updatedCosts) {
      setCosts(updatedCosts);
      initialCosts.current = JSON.parse(JSON.stringify(updatedCosts)); // Deep copy
    }
  }, [initialData.cost_breakdown, initialData.suggestion?.estimatedCost?.breakdown]);

  // Update hasEdits when any changes are made
  useEffect(() => {
    setHasEdits(hasNameChanged || hasDescriptionChanged || hasCostsChanged);
  }, [hasNameChanged, hasDescriptionChanged, hasCostsChanged]);

  // Get images from suggestion or project data - moved to useMemo
  const initialImages = useMemo(() => {
    if (!initialData.suggestion?.images) return []

    const images: { src: string, stage: 'generated' | 'upscaled' | 'source', label: string }[] = []
    
    if (initialData.suggestion.images.generated?.length) {
      initialData.suggestion.images.generated.forEach(image => {
        images.push({ src: image.url, stage: 'generated', label: 'Imagined ✨' })
      })
    }
    if (initialData.suggestion.images.upscaled?.url) {
      images.push({ 
        src: initialData.suggestion.images.upscaled.url, 
        stage: 'upscaled',
        label: 'Current' 
      })
    }
    if (!images.length && initialData.suggestion.images.source?.url) {
      images.push({ 
        src: initialData.suggestion.images.source.url, 
        stage: 'source', 
        label: 'Current' 
      })
    }
    return images
  }, [initialData.suggestion?.images])

  const handleNameChange = (newName: string) => {
    if (isReadOnly) return
    setName(newName)
    setHasNameChanged(newName !== initialName.current)
  }

  const handleDescriptionChange = (newDescription: string) => {
    if (isReadOnly) return
    setDescription(newDescription)
    setHasDescriptionChanged(newDescription !== initialDescription.current)
  }

  const handleFieldSave = (field: EditingField) => {
    if (!field) return

    const updates: OnUpdateProject = {
      id: projectId,
      status: projectStatus
    }

    if (field === 'name') {
      updates.name = name
    } else if (field === 'description') {
      updates.description = description
    }

    onUpdateProject?.(updates)
    setEditingField(null)
  }

  const handleCostUpdate = useCallback((updatedCosts: CostBreakdown) => {
    if (isReadOnly) return
    console.log('[ProjectDetails] Costs updated:', updatedCosts)
    
    // Update local state first
    setCosts(updatedCosts)
    
    // Check if costs have changed from initial values
    if (initialCosts.current) {
      const initialJson = JSON.stringify(initialCosts.current);
      const currentJson = JSON.stringify(updatedCosts);
      setHasCostsChanged(initialJson !== currentJson);
    }
    
    // Convert the nested format to the flat format expected by the database
    const flatCostBreakdown = convertNestedToFlatCostBreakdown(updatedCosts)
    
    // Send the flat format to the database
    const costUpdate = {
      id: projectId,
      status: projectStatus,
      cost_breakdown: flatCostBreakdown
    }
    
    onUpdateProject?.(costUpdate)
  }, [projectId, projectStatus, onUpdateProject, isReadOnly])

  const handleReimagineTap = useCallback(() => {
    if (isRegenerating || !initialData?.suggestion?.id) return;
    
    setIsRegenerating(true);
    
    const wsManager = WebSocketManager.getInstance();
    wsManager.emit('updateAndReimagineSuggestion', {
      projectId,
      suggestionId: initialData.suggestion.id
    }, { argBehavior: 'replace' });
    
    setTimeout(() => {
      setHasEdits(false);
      setHasNameChanged(false);
      setHasDescriptionChanged(false);
      setHasCostsChanged(false);
      
      initialName.current = name;
      initialDescription.current = description;
      if (costs) {
        initialCosts.current = JSON.parse(JSON.stringify(costs));
      }
      
      setIsRegenerating(false);
    }, 3000);
  }, [projectId, initialData.suggestion?.id, isRegenerating, name, description, costs]);

  if (isLoading) {
    return <ProjectDetailsSkeleton />
  }

  return (
    <div className="space-y-2 pt-5">
      {/* Project Images - Now using dedicated component */}
      <ProjectImages 
        projectId={projectId}
        initialImages={initialImages}
        isGenerating={initialData.suggestion?.images?.status?.isGenerating}
        isRegenerating={isRegenerating}
      />

      {/* Project Category */}
      {(!isReadOnly && (initialData.category || initialData.suggestion?.category)) && (
        <div className="w-full mb-6">
          <div className="w-full rounded-xl bg-gray-100/50 dark:bg-black/10 py-2 px-4 flex items-center justify-center gap-2">
            <span className="text-lg">
              {categoryEmojis[(initialData.category || initialData.suggestion?.category || 'other')]}
            </span>
            <span className="text-gray-800 dark:text-gray-300 font-medium uppercase text-sm tracking-wide font-display opacity-80">
              {(initialData.category || initialData.suggestion?.category || '').replace(/_/g, ' ')}
            </span>
          </div>
        </div>
      )}

      {/* Started by - only shown in read-only mode */}
      {isReadOnly && initialData._meta_created_by && (
        <div className="mb-4">
          <div className="w-full flex items-center justify-between pl-4 pr-[0.4rem] py-2 rounded-full bg-gray-100/80 dark:bg-black/20">
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Started by</span>
            <div className="flex items-center gap-2">
              <UserName userId={initialData._meta_created_by} className="text-sm font-medium" />
              <UserAvatar userId={initialData._meta_created_by} size={24} />
            </div>
          </div>
        </div>
      )}

      {/* Reimagine Button */}
      {!isReadOnly && (
        <div className="mt-4 pt-2">
          {hasEdits ? (
            <button 
              onClick={handleReimagineTap}
              disabled={isRegenerating}
              className={cn(
                "w-full rounded-lg bg-gradient-to-r from-blue-100 to-blue-200 dark:from-blue-950/50 dark:to-blue-900/70 p-4 flex items-center justify-between gap-3 transition-all",
                "hover:shadow-md hover:from-blue-200 hover:to-blue-300 dark:hover:from-blue-900/50 dark:hover:to-blue-800/70",
                "disabled:opacity-50 disabled:pointer-events-none"
              )}
            >
              <div className="flex flex-col items-start gap-1">
                <p className="text-sm font-medium text-blue-900 dark:text-blue-300">
                  Edits were made!
                </p>
                <p className="text-left text-sm text-blue-700 dark:text-blue-400">
                  Tap here to reimagine this space based on your changes
                </p>
              </div>
              <i className="fa-solid fa-wand-magic-sparkles text-blue-600 dark:text-blue-400 text-xl flex-shrink-0" />
            </button>
          ) : (
            <button
              onClick={handleReimagineTap}
              disabled={isRegenerating}
              className={cn(
                "w-full rounded-lg bg-gray-50 dark:bg-black/10 p-4", 
                "flex items-center justify-between gap-3 transition-colors",
                "hover:bg-gray-100 dark:hover:bg-black/20",
                "disabled:opacity-50 disabled:pointer-events-none"
              )}
            >
              <div className="flex flex-col items-start gap-1 text-left">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Something look off?
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Tap to reimagine this space with the current details
                </p>
              </div>
              <i className="fa-solid fa-wand-magic-sparkles text-gray-400 text-xl flex-shrink-0" />
            </button>
          )}
        </div>
      )}
      {/* Project Title */}
      {!isReadOnly ? (
        <div className={cn(
          !isReadOnly && "mb-0"
        )}>
          {editingField === 'name' ? (
          <div className="relative">
            <input
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              onBlur={() => handleFieldSave('name')}
              className="input w-full text-lg py-4 pr-10"
              placeholder="Project name"
              required
              autoFocus
            />
          </div>
        ) : (
          <div className="relative group">
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 py-2 pb-1 pr-10">
              {name}
            </h1>
            {!isReadOnly && (
              <button
                type="button"
                onClick={() => setEditingField('name')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <i className="fa-solid fa-pencil text-xs" />
              </button>
            )}
          </div>
        )}
      </div>
    ) : null}

      {/* Project Description */}
      <div className={cn(
        "transition-spacing duration-200",
        !isReadOnly && "-mt-6"
      )}>
        {editingField === 'description' ? (
          <div className="relative">
            <textarea
              value={description}
              onChange={(e) => handleDescriptionChange(e.target.value)}
              onBlur={() => handleFieldSave('description')}
              rows={3}
              className="input w-full py-4 pr-10"
              placeholder="Describe your project and any special considerations..."
              required
              autoFocus
            />
          </div>
        ) : (
          <div className="relative group">
            <p className="text-gray-600 dark:text-gray-300 py-2 pt-1 pr-10 whitespace-pre-wrap">
              {description}
            </p>
            {!isReadOnly && (
              <button
                type="button"
                onClick={() => setEditingField('description')}
                className="absolute right-4 top-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <i className="fa-solid fa-pencil text-xs" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Cost Estimate */}
      {costs && (
        <>
          <CostEstimate
            costs={costs}
            isReadOnly={isReadOnly}
            onChange={handleCostUpdate}
          />
        </>
      )}
    </div>
  )
} 