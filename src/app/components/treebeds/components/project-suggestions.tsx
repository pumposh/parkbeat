import { useCallback, useState, useRef, useEffect, useMemo } from 'react'
import { useProjectData } from '@/hooks/use-tree-sockets'
import { cn } from '@/lib/utils'
import styles from './project-suggestions.module.css'
import { getElementAutoSize } from '@/lib/dom'
import { WebSocketManager } from '@/hooks/websocket-manager'
import { Carousel } from '@/app/components/ui/carousel'
import { calculateProjectCosts, convertSuggestionToProjectCosts, formatCurrency } from '@/lib/cost'
import { ProjectSuggestion } from '@/server/types/shared'

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

interface ProjectSuggestionsProps {
  projectId: string
  onSuggestionSelect: (suggestion: ProjectSuggestion | null) => void
  isLoading?: boolean
}

function emitGenerateImagesForSuggestions(projectId: string, suggestionIds: string[]) {
  const wsManager = WebSocketManager.getInstance()
  return wsManager.emit('generateImagesForSuggestions', {
    projectId,
    suggestionIds
  }, { argBehavior: 'replace' })
}

export function ProjectSuggestions({ 
  projectId, 
  onSuggestionSelect,
  isLoading = false 
}: ProjectSuggestionsProps) {
  const [selectedIndex, setSelectedIndex] = useState<number>(-1)
  const cardRefs = useRef<(HTMLDivElement | null)[]>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const { projectData: { data: projectData } } = useProjectData(projectId)
  const [generatingImages, setGeneratingImages] = useState<Record<string, boolean>>({})

  // Use suggestions from project data if available
  const suggestions: ProjectSuggestion[] = projectData?.suggestions?.map(s => ({
      ...s,
      convertedCosts: convertSuggestionToProjectCosts(s) ?? undefined,
      spaceAssessment: {
        size: null,
        access: null,
        complexity: null,
        constraints: []
      },
      images: s.images as ProjectSuggestion['images']
    })) ?? []

  const cardFullHeights = useMemo(() => 
    cardRefs.current.map((ref) => {
      if (ref) { 
        const { height } = getElementAutoSize(ref)
        return height
      }
      return 0
    }), [cardRefs])

  // Update card heights when they mount or resize
  useEffect(() => {
    const updateCardHeights = () => {
      requestAnimationFrame(() => {
        cardRefs.current.forEach((ref, i) => {
          if (ref) {
            const height = cardFullHeights[i]
            ref.style.setProperty('--card-height', `${height}px`)
          }
        })
      })
    }

    // Initial measurement
    updateCardHeights()

    // Measure after a short delay to ensure content is rendered
    const timeout = setTimeout(updateCardHeights, 100)

    // Measure on resize
    window.addEventListener('resize', updateCardHeights)
    
    return () => {
      window.removeEventListener('resize', updateCardHeights)
      clearTimeout(timeout)
    }
  }, [suggestions.length])

  // Handle clicks outside of suggestions
  useEffect(() => {
    if (selectedIndex === -1) return

    const handleClickOutside = (event: MouseEvent) => {
      // Ignore clicks on dialog navigation buttons
      const target = event.target as HTMLElement
      const isNavigationButton = target.closest('button[aria-label="Next step"], button[aria-label="Previous step"]')
      if (isNavigationButton) return

      if (!containerRef.current?.contains(target)) {
        setSelectedIndex(-1)
        onSuggestionSelect(null)
      }
    }

    window.addEventListener('mousedown', handleClickOutside)
    return () => window.removeEventListener('mousedown', handleClickOutside)
  }, [selectedIndex, onSuggestionSelect])

  const handleSelect = useCallback((index: number) => {
    if (suggestions[index]) {
      const suggestion = suggestions[index]
      const projectCosts = convertSuggestionToProjectCosts(suggestion)
      
      setSelectedIndex(index)
      onSuggestionSelect({
        ...suggestion,
        convertedCosts: projectCosts ?? undefined,
        spaceAssessment: {
          size: null,
          access: null,
          complexity: null,
          constraints: []
        }
      })
    }
  }, [suggestions, onSuggestionSelect])

  const handleGenerateImage = useCallback((suggestionId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (generatingImages[suggestionId]) return

    setGeneratingImages(prev => ({ ...prev, [suggestionId]: true }))
    
    emitGenerateImagesForSuggestions(projectId, [suggestionId])
    
    setTimeout(() => {
      setGeneratingImages(prev => ({ ...prev, [suggestionId]: false }))
    }, 10000)
  }, [projectId, generatingImages])

  const SuggestionSkeleton = () => (
    <div className="frosted-glass p-4 space-y-3 opacity-60">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div className="h-4 w-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse-subtle" />
          <div className="h-3 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse-subtle" />
        </div>
        <div className="h-3 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse-subtle" />
      </div>
      <div className="h-6 w-2/3 bg-gray-200 dark:bg-gray-700 rounded animate-pulse-subtle" />
      <div className="h-16 w-full bg-gray-200 dark:bg-gray-700 rounded animate-pulse-subtle" />
    </div>
  )

  const SuggestionCard = ({ suggestion, index }: { suggestion: ProjectSuggestion, index: number }) => {
    const { title, summary, category, estimatedCost } = suggestion
    const [isCostBreakdownExpanded, setIsCostBreakdownExpanded] = useState(false)
    const costs = useMemo(() => calculateProjectCosts(estimatedCost?.breakdown), [estimatedCost])
    const isSelected = selectedIndex === index

    return (
      <div 
        ref={(el) => {
          cardRefs.current[index] = el
          return undefined
        }}
        className={cn(
          "frosted-glass",
          styles.card,
          selectedIndex !== -1 && !isSelected && styles.cardUnselected,
          {
            'hover:ring-2 hover:ring-accent/50 hover:shadow-md': selectedIndex === -1,
            'ring-2 ring-accent shadow-lg': isSelected
          }
        )}
        style={{
          '--card-height': `${cardFullHeights[index]}px`
        } as React.CSSProperties}
        onClick={() => handleSelect(index)}
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-sm opacity-70">
                {categoryEmojis[category] || categoryEmojis.other}
              </span>
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {category?.replace(/_/g, ' ')}
              </span>
            </div>
            <span className={cn(
              "text-sm font-medium transition-colors",
              isSelected 
                ? 'text-accent'
                : 'text-gray-500 dark:text-gray-400 group-hover:text-accent'
            )}>
              {costs?.total 
                ? formatCurrency(costs.total)
                : <i className="fa-solid fa-spinner fa-spin" />}
            </span>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 line-clamp-1">
            {title}
          </h3>
          <p className="text-gray-600 dark:text-gray-300 line-clamp-3 leading-relaxed text-sm">
            {summary}
          </p>
          {isSelected && costs && (
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setIsCostBreakdownExpanded(!isCostBreakdownExpanded)
                }}
                className="w-full flex items-center justify-between text-sm font-medium text-gray-900 dark:text-gray-100 mb-2"
              >
                <span>Cost Breakdown</span>
                <i className={cn(
                  "fa-solid fa-chevron-down transition-transform",
                  isCostBreakdownExpanded && "rotate-180"
                )} />
              </button>
              <div className={cn(
                "space-y-2 text-sm overflow-hidden transition-all duration-200 ease-in-out",
                isCostBreakdownExpanded ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
              )}>
                {costs.materials.items.length > 0 && (
                  <>
                    <div className="text-gray-500 dark:text-gray-400 mb-1">Materials</div>
                    {costs.materials.items.map((item: { item: string, cost: string }, i: number) => (
                      <div key={`material-${i}`}>
                        <div className="pl-4 text-gray-600 dark:text-gray-300 flex justify-between">
                          <span className="font-medium">{item.item?.replace('- ', '')}</span>
                          <span className="tabular-nums text-right min-w-[100px]">{formatCurrency(parseFloat(item.cost))}</span>
                        </div>
                      </div>
                    ))}
                  </>
                )}
                {costs.labor.items.length > 0 && costs.labor.total > 0 && (
                  <>
                    <div className="text-gray-500 dark:text-gray-400 mb-1">Labor</div>
                    {costs.labor.items.map((item: { description: string, hours: number, rate: number }, i: number) => (
                      <div key={`labor-${i}`}>
                        <div className="pl-4 text-gray-600 dark:text-gray-300 flex justify-between">
                          <span className="font-medium">{item.description?.replace('- ', '')}</span>
                          <span className="tabular-nums text-right min-w-[100px]">{item.hours * item.rate}</span>
                        </div>
                      </div>
                    ))}
                  </>
                )}
                {costs.other.items.length > 0 && costs.other.total > 0 && (
                  <>
                    <div className="text-gray-500 dark:text-gray-400 mb-1">Other</div>
                    {costs.other.items.map((item: { item: string, cost: string }, i: number) => (
                      <div key={`other-${i}`} className="pl-4 text-gray-600 dark:text-gray-300 flex justify-between">
                        <span className="font-medium">{item.item?.replace('- ', '')}</span>
                        <span className="tabular-nums text-right min-w-[100px]">{formatCurrency(parseFloat(item.cost))}</span>
                      </div>
                    ))}
                  </>
                )}
                <div className="flex justify-between font-medium text-gray-900 dark:text-gray-100 pt-2 border-t border-gray-200 dark:border-gray-700">
                  <span>Total Estimated Cost</span>
                  <span className="tabular-nums text-right min-w-[100px]">{formatCurrency(costs.total)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (isLoading || !projectData) {
    return (
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <SuggestionSkeleton key={i} />
        ))}
      </div>
    )
  }

  type ImageStage = 'upscaled' | 'source' | 'generated'

  const stageLabels: Record<ImageStage, string> = {
    generated: 'Imagined',
    upscaled: 'Current',
    source: 'Current'
  }
  
  const getImages = (suggestion: ProjectSuggestion): {
    src: string
    stage: ImageStage
  }[] => {
    if (!suggestion.images) return []
    const images: { src: string, stage: ImageStage }[] = []
    if (suggestion.images.generated?.length && suggestion.images.generated.length > 0) {
      suggestion.images.generated.forEach(image => {
        images.push({ src: image.url, stage: 'generated' })
      })
    }
    if (suggestion.images.upscaled?.url) {
      images.push({ src: suggestion.images.upscaled.url, stage: 'upscaled' })
    }
    if (!images.length && suggestion.images.source?.url) {
      images.push({ src: suggestion.images.source.url, stage: 'source' })
    }
    return images
  }

  return (
    <div 
      ref={containerRef}
      className={cn(
        styles.container,
        selectedIndex !== -1 && styles.hasSelection
      )}
    >
      {suggestions.length === 0 ? (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <SuggestionSkeleton key={i} />
          ))}
        </div>
      ) : (
        <>
          <div className={cn(
            "text-sm text-gray-500 dark:text-gray-400 mb-4",
            selectedIndex !== -1 && "hidden"
          )}>
            <i className="fa-solid fa-wand-magic-sparkles mr-2" />
            Select a suggestion to continue
          </div>
          <div className={cn(
            "space-y-4",
            selectedIndex !== -1 && "space-y-0"
          )}>
            {suggestions.map((suggestion, index) => (
              <div key={index}>
                {selectedIndex === index && (
                  <div className={cn(
                    styles.suggestionImage,
                    selectedIndex === index && styles.visible
                  )}>
                    {getImages(suggestion).length > 0 ? (
                      <div className={cn(
                        "w-full h-full relative",
                        suggestion.images?.status?.isGenerating && "animate-pulse"
                      )}>
                        <Carousel 
                          images={getImages(suggestion).map(img => ({
                            src: img.src,
                            alt: `${suggestion.title} - ${img.stage} image`,
                            label: stageLabels[img.stage]
                          }))}
                          showControls={true}
                          showIndicators={true}
                          autoPlay={false}
                        />
                        {/* Loading Overlay */}
                        {(suggestion.images?.status?.isGenerating || suggestion.images?.status?.isUpscaling) && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-sm z-20">
                            <div className="frosted-glass rounded-xl px-4 py-2 flex items-center gap-2">
                              <i className={cn(
                                "fa-solid",
                                suggestion.images.status.isGenerating ? "fa-wand-magic-sparkles" : "fa-expand",
                                "text-zinc-700 dark:text-zinc-300"
                              )} />
                              <span className="text-sm text-zinc-700 dark:text-zinc-300">
                                {suggestion.images.status.isGenerating ? "Generating image..." : "Upscaling image..."}
                              </span>
                            </div>
                          </div>
                        )}
                        {/* Error Overlay */}
                        {suggestion.images?.status?.lastError && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-sm z-20">
                            <div className="frosted-glass rounded-xl px-4 py-2 flex items-center gap-2 text-red-500">
                              <i className="fa-solid fa-triangle-exclamation" />
                              <span className="text-sm">
                                Failed to generate image
                              </span>
                              <button
                                onClick={(e) => handleGenerateImage(suggestion.id, e)}
                                className="ml-2 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                              >
                                <i className="fa-solid fa-rotate-right" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div 
                        className={cn(
                          styles.imageSkeleton,
                          (suggestion.images?.status?.isGenerating || generatingImages[suggestion.id]) && 'cursor-wait'
                        )}
                        onClick={(e) => handleGenerateImage(suggestion.id, e)}
                        role="button"
                        title={
                          suggestion.images?.status?.isGenerating 
                            ? "Generating image..." 
                            : generatingImages[suggestion.id] 
                              ? "Generating image..."
                              : "Click to generate image"
                        }
                      >
                        {suggestion.images?.status?.isGenerating || generatingImages[suggestion.id] ? (
                          <div className="flex flex-col items-center gap-2">
                            <i className="fa-solid fa-wand-magic-sparkles fa-spin text-2xl" />
                            <span className="text-sm">Generating image...</span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-2">
                            <i className="fa-regular fa-image text-2xl" />
                            <span className="text-sm">Click to generate</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                <SuggestionCard
                  suggestion={suggestion}
                  index={index}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}