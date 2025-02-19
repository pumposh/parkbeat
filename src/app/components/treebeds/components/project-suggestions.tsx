import { useCallback, useState, useEffect } from 'react'
import type { Project } from '@/server/routers/tree-router'
import { client } from '@/lib/client'
import Image from 'next/image'
import { useProjectData } from '@/hooks/use-tree-sockets'

interface ProjectSuggestion {
  title: string
  summary: string
  imagePrompt: string
  generatedImageUrl?: string
}

interface ProjectSuggestionsProps {
  projectId: string
  currentImageUrl: string
  onSuggestionSelect: (suggestion: ProjectSuggestion) => void
  isLoading?: boolean
}

export function ProjectSuggestions({ 
  projectId, 
  currentImageUrl, 
  onSuggestionSelect,
  isLoading = false 
}: ProjectSuggestionsProps) {
  const [selectedIndex, setSelectedIndex] = useState<number>(-1)
  const [isFetching, setIsFetching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const projectData = useProjectData(projectId)

  // Use suggestions from project data if available
  const suggestions = projectData?.data?.suggestions || []

  const fetchSuggestions = useCallback(async () => {
    setIsFetching(true)
    setError(null)
    try {
      const response = await client.ai.analyzeImage.$post({
        projectId,
        imageSource: {
          type: 'url',
          url: currentImageUrl
        },
        fundraiserId: projectId
      })

      const data = await response.json()
      if ('error' in data) {
        throw new Error(data.error as string)
      }

      if (!('suggestions' in data)) {
        throw new Error('No suggestions found')
      }
    } catch (err) {
      setError('Failed to load project suggestions. Please try again.')
      console.error('[ProjectSuggestions] Error fetching suggestions:', err)
    } finally {
      setIsFetching(false)
    }
  }, [projectId, currentImageUrl])

  const handleSelect = useCallback((index: number) => {
    if (suggestions[index]) {
      setSelectedIndex(index)
      onSuggestionSelect(suggestions[index])
    }
  }, [suggestions, onSuggestionSelect])

  if (isLoading || isFetching) {
    return (
      <div className="grid grid-cols-2 gap-4">
        {[0, 1].map((i) => (
          <div key={i} className="frosted-glass p-4 space-y-4">
            <div className="h-40 w-full bg-gray-200 animate-pulse rounded-lg" />
            <div className="h-6 w-3/4 bg-gray-200 animate-pulse rounded" />
            <div className="h-20 w-full bg-gray-200 animate-pulse rounded" />
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center p-8">
        <p className="text-red-500 mb-4">{error}</p>
        <button 
          onClick={fetchSuggestions}
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
        >
          Try Again
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {suggestions.length === 0 ? (
        <div className="text-center p-8">
          <p className="text-gray-500 mb-4">No suggestions yet. Generate some ideas for this space!</p>
          <button 
            onClick={fetchSuggestions}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
          >
            Generate Suggestions
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {suggestions.map((suggestion, index) => (
            <div 
              key={index}
              className={`frosted-glass p-4 cursor-pointer transition-all ${
                selectedIndex === index 
                  ? 'ring-2 ring-primary shadow-lg' 
                  : 'hover:ring-2 hover:ring-primary/50 hover:shadow-md'
              }`}
              onClick={() => handleSelect(index)}
            >
              {suggestion.generatedImageUrl && (
                <div className="relative h-40 w-full mb-4 rounded-lg overflow-hidden">
                  <Image
                    src={suggestion.generatedImageUrl}
                    alt={suggestion.title}
                    fill
                    className="object-cover"
                  />
                </div>
              )}
              <h3 className="text-lg font-semibold mb-2">{suggestion.title}</h3>
              <p className="text-gray-600">{suggestion.summary}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}