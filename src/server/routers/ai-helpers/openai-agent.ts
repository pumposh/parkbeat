import OpenAI from 'openai'
import type { AIAnalysisResult, ProjectSuggestion, AIAgent } from './aigent'
import type { ProjectCategory } from "@/types/types"
import { PromptManager } from './prompts'
import { generateId } from '@/lib/id'
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions.mjs'
import { getServerLogger } from '../../utils/logger'
import { parseCostValue } from '@/lib/cost'
import type { AIEstimateResult, BaseCostItem, LaborCostItem } from '@/server/types/shared'

/**
 * Implementation of AIAgent for OpenAI
 */
export class OpenAIAgent implements AIAgent {
  private client: OpenAI
  private model = 'gpt-4o'
  private logger = getServerLogger()

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey })
  }

  // Common parsing methods copied from BaseAIAgent to avoid circular dependencies
  protected parseSuggestionsFromResponse(content: string): ProjectSuggestion[] {
    try {
      // Split content into sections
      const sections = content.split('---').filter(Boolean)
      
      return sections.map(section => {
        const lines = section.trim().split('\n')
        const title = lines.find(l => l.toLowerCase().startsWith('title:'))?.split(':')[1]?.trim() || ''
        const summary = lines.find(l => l.toLowerCase().startsWith('summary:'))?.split(':')[1]?.trim() || ''
        const category = lines.find(l => l.toLowerCase().startsWith('type:'))?.split(':')[1]?.trim() as ProjectCategory || 'other'
        const imagePrompt = lines.find(l => l.toLowerCase().startsWith('image prompt:'))?.split(':')[1]?.trim() || ''
        const costLine = lines.find(l => l.toLowerCase().startsWith('estimated cost:'))?.split(':')[1]?.trim() || '0'
        const cost = parseInt(costLine.replace(/[^0-9]/g, '')) || 0

        return {
          id: generateId(),
          title,
          summary,
          imagePrompt,
          category,
          estimatedCost: {
            total: cost
          }
        }
      })
    } catch (error) {
      this.logger.error('Error parsing suggestions:', error)
      return []
    }
  }

  /**
   * Parses the full structured suggestions from AI response
   */
  protected parseSuggestions(content: string): Array<ProjectSuggestion> {
    const suggestions: Array<ProjectSuggestion> = []
    const sections = content.split('---').filter(Boolean)

    for (const section of sections) {
      const lines = section.trim().split('\n')
      let currentSuggestion: Partial<ProjectSuggestion> = {}

      for (const line of lines) {
        const [key, ...valueParts] = line.split(':')
        const value = valueParts.join(':').trim()

        switch (key?.trim().toUpperCase()) {
          case 'TITLE':
            currentSuggestion.title = value
            break
          case 'TYPE':
            currentSuggestion.category = value.toLowerCase().replace(/ /g, '_')
            break
          case 'SUMMARY':
            currentSuggestion.summary = value
            break
          case 'IMAGE PROMPT':
            currentSuggestion.imagePrompt = value
            break
          case 'ESTIMATED COST':
            try {
              const cost = parseFloat(value.replace(/[^0-9.]/g, ''))
              currentSuggestion.estimatedCost = {
                total: cost
              }
            } catch (e) {
              currentSuggestion.estimatedCost = {
                total: 0
              }
            }
            break
        }
      }

      if (currentSuggestion.title && 
          currentSuggestion.summary && 
          currentSuggestion.category && 
          currentSuggestion.imagePrompt && 
          currentSuggestion.estimatedCost) {
        suggestions.push(currentSuggestion as ProjectSuggestion)
      }
    }

    return suggestions
  }

  /**
   * Parses cost estimate from AI response
   */
  protected parseEstimateFromResponse(response: string): AIEstimateResult {
    // Initialize the result structure
    const estimate: AIEstimateResult = {
      totalEstimate: 0,
      breakdown: {
        materials: {
          items: [],
          total: 0
        },
        labor: {
          items: [],
          total: 0
        },
        other: {
          items: [],
          total: 0
        },
        total: 0
      },
      assumptions: [],
      confidenceScore: 0.8
    }

    const sections = response.split('\n\n')

    // Parse materials section
    const materialsSection = sections.find((s) => s.includes('MATERIALS BREAKDOWN'))
    if (materialsSection) {
      const materialItems: BaseCostItem[] = materialsSection
        .split('\n')
        .filter((l) => l.includes('$'))
        .map((l) => {
          const parts = l.split('$')
          const name = parts[0] || ''
          const costString = parts[1] || '0'
          const costValue = parseFloat(costString.replace(/[^0-9.]/g, '') || '0')
          const hasCents = (costValue - Math.floor(costValue)) !== 0;
          const cost = hasCents ? `$${costValue.toFixed(2)}` : `$${costValue.toFixed(0)}`;
          return {
            item: name.trim() || '',
            cost,
            isIncluded: true
          }
        })
      
      estimate.breakdown.materials = {
        items: materialItems,
        total: materialItems.reduce((sum: number, item: BaseCostItem) => 
          sum + parseCostValue(item.cost), 0)
      }
    }

    // Parse labor section
    const laborSection = sections.find((s) => s.includes('LABOR COSTS'))
    if (laborSection) {
      const laborItems: LaborCostItem[] = laborSection
        .split('\n')
        .filter((l) => l.includes('$'))
        .map((l) => {
          const [type, details] = l.split(':')
          const detailsParts = details ? details.split('x') : ['0', '0']
          const rate = parseFloat(detailsParts[0]?.replace(/[^0-9.]/g, '') || '0') || 0
          const hours = parseFloat(detailsParts[1]?.replace(/[^0-9.]/g, '') || '0') || 0
          
          return {
            task: type?.trim() || undefined,
            description: type?.trim() || '',
            rate,
            hours,
            isIncluded: true
          }
        })
      
      estimate.breakdown.labor = {
        items: laborItems,
        total: laborItems.reduce((sum: number, item: LaborCostItem) => 
          sum + (item.rate * item.hours), 0)
      }
    }

    // Parse other costs (including permits, management, contingency)
    const otherSection = sections.find((s) => s.includes('OTHER COSTS'))
    if (otherSection) {
      const otherItems: BaseCostItem[] = otherSection
        .split('\n')
        .filter((l) => l.includes('$'))
        .map((l) => {
          const parts = l.split('$')
          const name = parts[0] || ''
          const costString = parts[1] || '0'
          const costValue = parseFloat(costString.replace(/[^0-9.]/g, '') || '0')
          const hasCents = (costValue - Math.floor(costValue)) !== 0;
          const cost = hasCents ? `$${costValue.toFixed(2)}` : `$${costValue.toFixed(0)}`;
          return {
            item: name.trim() || '',
            cost,
            isIncluded: true
          }
        })
      
      estimate.breakdown.other = {
        items: otherItems,
        total: otherItems.reduce((sum: number, item: BaseCostItem) => 
          sum + parseCostValue(item.cost), 0)
      }
    }

    // Calculate total
    estimate.breakdown.total = (
      estimate.breakdown.materials.total +
      estimate.breakdown.labor.total +
      estimate.breakdown.other.total
    )
    estimate.totalEstimate = estimate.breakdown.total

    // Parse assumptions
    const assumptionsSection = sections.find((s) => s.includes('ASSUMPTIONS'))
    if (assumptionsSection) {
      estimate.assumptions = assumptionsSection
        .split('\n')
        .filter((l) => l.startsWith('-'))
        .map((l) => l.slice(1).trim())
    } else {
      estimate.assumptions = []
    }

    // Parse confidence score
    const confidenceLine = response.split('\n').find((l) => l.includes('CONFIDENCE SCORE'))
    if (confidenceLine) {
      const confidenceValue = confidenceLine.split(':')[1]
      estimate.confidenceScore = confidenceValue ? parseFloat(confidenceValue.trim()) || 0.8 : 0.8
    }

    return estimate;
  }

  async validateImage({ imageUrl }: { imageUrl: string }): Promise<{
    isValid: boolean
    isMaybe: boolean
    description: string
    error?: string
  }> {
    const prompt = PromptManager.getInitialSpaceCheckPrompt()

    const result = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: 'system',
          content: prompt.systemPrompt
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt.userPrompt },
            {
              type: 'image_url',
              image_url: { url: imageUrl }
            }
          ]
        }
      ],
      temperature: prompt.temperature,
      max_tokens: 200
    })

    this.logger.debug('OpenAI result', result.choices[0])

    const content = result.choices[0]?.message?.content
    if (!content) {
      return {
        isValid: false,
        isMaybe: false,
        description: '',
        error: 'Failed to validate image'
      }
    }

    const [validity, ...descriptionParts] = content.split('\n')
    const isValid = !validity?.toUpperCase().includes('NO')
    const isMaybe = validity?.toUpperCase().includes('MAYBE') ?? false
    const description = descriptionParts.join('\n').trim()

    return {
      isValid,
      isMaybe,
      description,
      error: isValid ? undefined : description
    }
  }

  async analyzeImage({ imageUrl, locationContext, userContext }: {
    imageUrl: string
    locationContext?: string
    userContext?: string
  }): Promise<AIAnalysisResult> {
    // First check if this is an appropriate outdoor space
    const initialCheckPrompt = PromptManager.getInitialSpaceCheckPrompt()
    const initialCheck = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: 'system',
          content: initialCheckPrompt.systemPrompt
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: initialCheckPrompt.userPrompt },
            {
              type: 'image_url',
              image_url: { url: imageUrl }
            }
          ]
        }
      ],
      temperature: initialCheckPrompt.temperature,
      max_tokens: 150
    })

    const responseContent = initialCheck.choices[0]?.message?.content
    if (!responseContent) {
      throw new Error('Failed to get response from OpenAI')
    }

    const responseLines = responseContent.split('\n')
    const isNotOutdoorSpace = responseLines[0]?.includes('NO') ?? false
    const description = responseLines[1] ?? 'No description available'

    if (isNotOutdoorSpace) {
      return {
        isOutdoorSpace: false,
        description,
        analysis: "This space doesn't appear suitable for a community project."
      }
    }

    // If appropriate, generate suggestions
    const suggestionsPrompt = PromptManager.getProjectSuggestionsPrompt({
      model: this.model,
      locationContext,
      userContext,
      maxSuggestions: 3
    })

    const result = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: 'system',
          content: suggestionsPrompt.systemPrompt
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: suggestionsPrompt.userPrompt },
            {
              type: 'image_url',
              image_url: { url: imageUrl }
            }
          ]
        }
      ],
      temperature: suggestionsPrompt.temperature,
      max_tokens: 1000
    })

    const suggestionsContent = result.choices[0]?.message?.content
    if (!suggestionsContent) {
      throw new Error('Failed to get suggestions from OpenAI')
    }

    // Parse suggestions from the response using base class method
    const suggestions = this.parseSuggestionsFromResponse(suggestionsContent)

    return {
      isOutdoorSpace: true,
      description,
      analysis: suggestionsContent,
      suggestions
    }
  }

  async generateEstimate({ description, category, scope }: {
    description: string
    category: string
    scope: {
      size: number
      complexity: 'low' | 'medium' | 'high'
      timeline: number
    }
  }): Promise<{
    analysis: string
    estimate: AIEstimateResult
  }> {
    const logger = getServerLogger()
    logger.log('info', `Generating estimate for project in category: ${category}`)

    try {
      const prompt = PromptManager.getCostEstimatePrompt({
        model: this.model,
        description,
        category: category as ProjectCategory,
        scope
      })

      // Call OpenAI API
      const completionMessages: ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: prompt.systemPrompt
        },
        {
          role: 'user',
          content: prompt.userPrompt
        }
      ]

      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: completionMessages,
        temperature: 0.2,
        max_tokens: 3000
      })

      // Safely access the message content with proper null checking
      const responseMessage = completion.choices[0]?.message
      const response = responseMessage ? responseMessage.content || '' : ''
      logger.log('info', `Generated cost estimate, length: ${response.length} chars`)

      // Use base class method to parse the estimate
      const estimate = this.parseEstimateFromResponse(response)

      return {
        analysis: response,
        estimate
      }
    } catch (error) {
      logger.log('error', `Error generating cost estimate: ${error}`)
      throw error
    }
  }

  async analyzeImages(params: {
    images: Array<{
      imageUrl: string
      locationContext?: string
      userContext?: string
    }>
    maxSuggestions: number
    locationContext?: string
  }): Promise<{
    suggestions: Array<ProjectSuggestion>
  }> {
    const prompt = PromptManager.getProjectSuggestionsPrompt({
      model: this.model,
      locationContext: params.locationContext,
      userContext: params.images.map(img => img.userContext).filter(Boolean).join('\n'),
      maxSuggestions: params.maxSuggestions
    })

    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: prompt.systemPrompt },
      { role: 'user', content: prompt.userPrompt }
    ]

    // Add each image to the messages
    for (const image of params.images) {
      messages.push({
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: image.imageUrl }
          }
        ]
      })
    }

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages,
      max_tokens: 2000,
      temperature: prompt.temperature
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      throw new Error('No response from OpenAI')
    }

    // Parse the suggestions using base class method
    const suggestions = this.parseSuggestions(content)
    return { suggestions: suggestions.slice(0, params.maxSuggestions) }
  }
} 