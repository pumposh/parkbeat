import { useCallback, useState, useRef, useEffect, useMemo } from 'react'
import { useProjectData } from '@/hooks/use-tree-sockets'
import { cn } from '@/lib/utils'
import styles from './project-suggestions.module.css'
import { getElementAutoSize } from '@/lib/dom'
import { WebSocketManager } from '@/hooks/websocket-manager'
import { Carousel } from '@/app/components/ui/carousel'
import { ProjectData } from '@/server/types/shared'
import { calculateProjectCosts } from '@/lib/cost'

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

type ProjectSuggestion = NonNullable<ProjectData['suggestions']>[number]

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
  const suggestions: ProjectSuggestion[] = projectData?.suggestions || []

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
      if (!containerRef.current?.contains(event.target as Node)) {
        setSelectedIndex(-1)
        onSuggestionSelect(null)
      }
    }

    window.addEventListener('mousedown', handleClickOutside)
    return () => window.removeEventListener('mousedown', handleClickOutside)
  }, [selectedIndex, onSuggestionSelect])

  const handleSelect = useCallback((index: number) => {
    if (suggestions[index]) {
      setSelectedIndex(index)
      onSuggestionSelect(suggestions[index])
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

    return (
      <div 
        ref={(el) => {
          cardRefs.current[index] = el
          return undefined
        }}
        className={cn(
          "frosted-glass",
          styles.card,
          selectedIndex !== -1 && selectedIndex !== index && styles.cardUnselected,
          {
            'hover:ring-2 hover:ring-accent/50 hover:shadow-md': selectedIndex === -1,
            'ring-2 ring-accent shadow-lg': selectedIndex === index
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
              selectedIndex === index 
                ? 'text-accent'
                : 'text-gray-500 dark:text-gray-400 group-hover:text-accent'
            )}>
              {costs?.total 
                ? `$${costs.total.toLocaleString()}`
                : <i className="fa-solid fa-spinner fa-spin" />}
            </span>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 line-clamp-1">
            {title}
          </h3>
          <p className="text-gray-600 dark:text-gray-300 line-clamp-3 leading-relaxed text-sm">
            {summary}
          </p>
          {selectedIndex === index && costs && (
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
                    {costs.materials.items.map(item => (
                      <div>
                        <div className="pl-4 text-gray-600 dark:text-gray-300 flex justify-between">
                          <span className="font-medium">{item[0]?.replace('- ', '')}</span>
                          <span className="tabular-nums text-right min-w-[100px]">{item[1]}</span>
                        </div>
                      </div>
                    ))}
                  </>
                )}
                {costs.labor.items.length > 0 && (
                  <>
                    <div className="text-gray-500 dark:text-gray-400 mb-1">Labor</div>
                    {costs.labor.items.map(item => (
                      <div>
                        <div className="pl-4 text-gray-600 dark:text-gray-300 flex justify-between">
                          <span className="font-medium">{item[0]?.replace('- ', '')}</span>
                          <span className="tabular-nums text-right min-w-[100px]">{item[1]}</span>
                        </div>
                      </div>
                    ))}
                  </>
                )}
                {costs.other.items.length > 0 && (
                  <>
                    <div className="text-gray-500 dark:text-gray-400 mb-1">Other</div>
                    {costs.other.items.map(item => (
                      <div className="pl-4 text-gray-600 dark:text-gray-300 flex justify-between">
                        <span className="font-medium">{item[0]?.replace('- ', '')}</span>
                        <span className="tabular-nums text-right min-w-[100px]">{item[1]}</span>
                      </div>
                    ))}
                  </>
                )}
                <div className="flex justify-between font-medium text-gray-900 dark:text-gray-100 pt-2 border-t border-gray-200 dark:border-gray-700">
                  <span>Total Estimated Cost</span>
                  <span className="tabular-nums text-right min-w-[100px]">${costs.total.toLocaleString()}</span>
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
    generated: 'AI Generated',
    upscaled: 'Enhanced Original',
    source: 'Original'
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
    if (suggestion.images.source?.url) {
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
                      <div className="w-full h-full">
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
                      </div>
                    ) : (
                      <div 
                        className={cn(
                          styles.imageSkeleton,
                          generatingImages[suggestion.id] && 'cursor-wait'
                        )}
                        onClick={(e) => handleGenerateImage(suggestion.id, e)}
                        role="button"
                        title={generatingImages[suggestion.id] ? "Generating image..." : "Click to generate image"}
                      >
                        {generatingImages[suggestion.id] ? (
                          <i className="fa-solid fa-spinner fa-spin" />
                        ) : (
                          <i className="fa-regular fa-image" />
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