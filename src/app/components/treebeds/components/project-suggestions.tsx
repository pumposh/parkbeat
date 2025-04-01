import { useCallback, useState, useRef, useEffect, useMemo } from 'react'
import { useProjectData } from '@/hooks/use-tree-sockets'
import { cn } from '@/lib/utils'
import styles from './project-suggestions.module.css'
import { getElementAutoSize } from '@/lib/dom'
import { WebSocketManager } from '@/hooks/websocket-manager'
import { calculateProjectCosts, convertSuggestionToProjectCosts, formatCurrency } from '@/lib/cost'
import type { ProjectSuggestion } from '@/server/types/shared'

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

const sortSuggestions = (suggestions: ProjectSuggestion[]) => {
  return suggestions.sort((a, b) => {
    const aId = a.id
    const bId = b.id
    return aId.localeCompare(bId)
  })
}

export function ProjectSuggestions({ 
  projectId, 
  onSuggestionSelect,
  isLoading = false 
}: ProjectSuggestionsProps) {
  const [selectedSuggestionId, setSelectedSuggestionId] = useState<string | null>(null)
  const [generatingImages, setGeneratingImages] = useState<Record<string, boolean>>({})
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const { projectData: { data: projectData } } = useProjectData(projectId)
  const suggestions = sortSuggestions(projectData?.suggestions ?? [])

  // Auto-generate images for suggestions that don't have images
  useEffect(() => {
    if (projectData?.suggestions && projectData.suggestions.length > 0) {
      const suggestionsWithoutImages = projectData.suggestions
        .filter(suggestion => 
          // Only process suggestions that have their cost estimates completed (not being estimated)
          !suggestion.is_estimating &&
          // Only process suggestions without images
          !suggestion.images?.generated?.length && 
          !suggestion.images?.status?.isGenerating &&
          !suggestion.images?.status?.isUpscaling &&
          !generatingImages[suggestion.id]
        )
        .map(suggestion => suggestion.id);
      
      if (suggestionsWithoutImages.length > 0) {
        setGeneratingImages(prev => {
          const newState = { ...prev };
          suggestionsWithoutImages.forEach(id => {
            if (!newState[id]) {
              newState[id] = true;
            }
          });
          return newState;
        });
        
        emitGenerateImagesForSuggestions(projectId, suggestionsWithoutImages);
      }
    }
    console.log('projectData?.project?.source_suggestion_id', projectData?.project?.source_suggestion_id)
    if (projectData?.project?.source_suggestion_id) {
      setSelectedSuggestionId(projectData.project.source_suggestion_id)
    }
  }, [projectData?.suggestions, projectId]);

  const cardFullHeights = useMemo(() => 
    Object.values(cardRefs.current).map((ref) => {
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
        Object.values(cardRefs.current).forEach((ref, i) => {
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

  const handleSelect = useCallback((index: number) => {
    if (suggestions[index]) {
      const suggestion = suggestions[index]
      const projectCosts = convertSuggestionToProjectCosts(suggestion)
      
      // Update the selected card
      setSelectedSuggestionId(suggestion.id)
      
      // Notify parent component
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
    const costs = useMemo(() => calculateProjectCosts(estimatedCost?.breakdown), [estimatedCost])
    const isSelected = selectedSuggestionId === suggestion.id

    return (
      <div 
        ref={(el) => {
          cardRefs.current[suggestion.id] = el
          return undefined
        }}
        className={cn(
          "frosted-glass",
          styles.card,
          "hover:ring-2 hover:ring-accent/50 hover:shadow-md",
          isSelected && "ring-2 ring-accent shadow-lg"
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
              "text-sm font-medium",
              isSelected ? 'text-accent' : 'text-gray-500 dark:text-gray-400'
            )}>
              {suggestion.is_estimating ? (
                <div className="flex items-center">
                  <i className="fa-solid fa-circle-notch fa-spin mr-1" />
                </div>
              ) : costs?.total ? (
                formatCurrency(costs.total)
              ) : (
                <i className="fa-solid fa-circle-notch fa-spin" />
              )}
            </span>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 line-clamp-1">
            {title}
          </h3>
          <p className="text-gray-600 dark:text-gray-300 line-clamp-3 leading-relaxed text-sm">
            {summary}
          </p>
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

  return (
    <div className={styles.container}>
      <div className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        <i className="fa-solid fa-wand-magic-sparkles mr-2" />
        Select a suggestion to continue
      </div>
      <div className="space-y-4">
        {suggestions.length === 0 ? (
          [0, 1, 2].map((i) => <SuggestionSkeleton key={i} />)
        ) : (
          suggestions.map((suggestion: ProjectSuggestion, index: number) => (
            <SuggestionCard 
              key={suggestion.id} 
              suggestion={suggestion} 
              index={index} 
            />
          ))
        )}
      </div>
    </div>
  )
}