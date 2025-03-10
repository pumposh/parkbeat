import { useCallback, useState, useEffect } from 'react'
import type { ProjectData, ProjectStatus } from '@/server/types/shared'
import { useLiveTrees } from '@/hooks/use-tree-sockets'
import type { ProjectFormData } from '../tree-dialog'
import { cn } from '@/lib/utils'
import { calculateProjectCosts } from '@/lib/cost'
import { CostEstimate } from './cost-estimate'
import { Carousel } from '@/app/components/ui/carousel'
import { UserAvatar } from '@/app/components/ui/user-avatar'
import { UserName } from '@/app/components/ui/user-name'

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
  useEffect(() => {
    if (initialData.name === name) return;
    setName(initialData.name)
  }, [initialData.name])

  const [description, setDescription] = useState(initialData.description)
  useEffect(() => {
    if (initialData.description === description) return;
    setDescription(initialData.description)
  }, [initialData.description])

  const [editingField, setEditingField] = useState<EditingField>(null)
  const [costs, setCosts] = useState(() => {
    if (initialData.cost_breakdown) {
      return calculateProjectCosts(initialData.cost_breakdown)
    }
    if (initialData.suggestion?.estimatedCost?.breakdown) {
      return calculateProjectCosts(initialData.suggestion.estimatedCost.breakdown)
    }
    return null
  })

  // Update costs when initialData changes
  useEffect(() => {
    if (initialData.cost_breakdown) {
      setCosts(calculateProjectCosts(initialData.cost_breakdown))
    } else if (initialData.suggestion?.estimatedCost?.breakdown) {
      setCosts(calculateProjectCosts(initialData.suggestion.estimatedCost.breakdown))
    }
  }, [initialData.cost_breakdown, initialData.suggestion?.estimatedCost?.breakdown])

  // Get images from suggestion or project data
  const getImages = () => {
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
  }

  const images = getImages()

  const handleNameChange = (newName: string) => {
    if (isReadOnly) return
    setName(newName)
  }

  const handleDescriptionChange = (newDescription: string) => {
    if (isReadOnly) return
    setDescription(newDescription)
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

  const handleCostUpdate = useCallback((updatedCosts: any) => {
    if (isReadOnly) return
    console.log('[ProjectDetails] Costs updated:', updatedCosts)
    
    // Update local state first
    setCosts(updatedCosts)
    
    // Convert the cost items to match the expected format
    const costUpdate = {
      id: projectId,
      status: projectStatus,
      cost_breakdown: {
        materials: updatedCosts.materials.items.map((item: any) => ({
          item: item.item,
          cost: item.cost,
          isIncluded: item.isIncluded ?? true
        })),
        labor: updatedCosts.labor.items.map((item: any) => ({
          description: item.description,
          hours: item.hours,
          rate: item.rate,
          isIncluded: item.isIncluded ?? true
        })),
        other: updatedCosts.other.items.map((item: any) => ({
          item: item.item,
          cost: item.cost,
          isIncluded: item.isIncluded ?? true
        }))
      }
    }
    
    onUpdateProject?.(costUpdate)
  }, [projectId, projectStatus, onUpdateProject, isReadOnly])

  if (isLoading) {
    return <ProjectDetailsSkeleton />
  }

  return (
    <div className="space-y-2 pt-5">
      {/* Project Images */}
      {images.length > 0 && (
        <div className="relative w-full mb-4">
          <div className="relative w-full pb-[100%] rounded-lg overflow-hidden">
            <div className="absolute inset-0">
              <Carousel
                images={images.map(img => ({
                  src: img.src,
                  alt: `${name} - ${img.stage} image`,
                  label: img.label
                }))}
                showControls={true}
                showIndicators={true}
                autoPlay={false}
              />
              {initialData.suggestion?.images?.status?.isGenerating && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-sm z-20">
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
      )}

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
          {!isReadOnly && (
            <div className="mt-4 pt-4 pb-12">
              <div className="rounded-lg bg-gray-50 dark:bg-black/10 p-4 flex items-center gap-3">
                <i className="fa-solid fa-circle-info text-gray-400" />
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Something look off?
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Edit material and labor estimates for a more accurate fundraising goal
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
} 