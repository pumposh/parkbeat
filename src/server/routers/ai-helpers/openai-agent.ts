import OpenAI from 'openai'
import type { AIAgent, AIAnalysisResult, AIEstimateResult, ProjectSuggestion } from './aigent'
import type { ProjectCategory } from "@/types/types"
import { PromptManager } from './prompts'
import { generateId } from '@/lib/id'
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions.mjs'
export class OpenAIAgent implements AIAgent {
  private client: OpenAI
  private model = 'gpt-4o'
  private textModel = 'gpt-4o'

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey })
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

    console.log('result', result.choices[0])

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

    // Parse suggestions from the response
    const suggestions = this.parseSuggestionsFromResponse(suggestionsContent)

    return {
      isOutdoorSpace: true,
      description,
      analysis: suggestionsContent,
      suggestions
    }
  }

  private parseSuggestionsFromResponse(content: string): ProjectSuggestion[] {
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
      console.error('Error parsing suggestions:', error)
      return []
    }
  }

  async generateImage({ prompt, originalImage }: {
    prompt: string
    originalImage: string
  }): Promise<{ url: string }> {
    try {
      const response = await this.client.images.generate({
        model: "dall-e-3",
        prompt: `Based on this street view image (${originalImage}), create a realistic visualization of: ${prompt}. 
                Make it photo-realistic and maintain the exact same perspective and viewing angle as the original street view.
                The result should look like it was taken from the same spot.`,
        n: 1,
        size: "1024x1024",
        quality: "standard",
        style: "natural"
      })

      const imageUrl = response.data[0]?.url
      if (!imageUrl) {
        throw new Error('No image generated')
      }

      return { url: imageUrl }
    } catch (error) {
      console.error('Error generating image:', error)
      throw error
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
    const prompt = PromptManager.getCostEstimatePrompt({
      model: this.textModel,
      description,
      category: category as ProjectCategory,
      scope
    })

    const result = await this.client.chat.completions.create({
      model: this.textModel,
      messages: [
        {
          role: 'system',
          content: prompt.systemPrompt
        },
        {
          role: 'user',
          content: prompt.userPrompt
        }
      ],
      temperature: prompt.temperature,
      max_tokens: 1000
    })

    const analysis = result.choices[0]?.message?.content
    if (!analysis) {
      throw new Error('Failed to get cost estimate from OpenAI')
    }

    console.log('[generateEstimate] analysis', analysis)

    // Parse the response into structured sections
    const sections = analysis.split('\n\n')
    const estimate: AIEstimateResult = {
      totalEstimate: 0,
      breakdown: {
        materials: [],
        labor: [],
        permits: 0,
        management: 0,
        contingency: 0
      },
      assumptions: [],
      confidenceScore: 0.8
    }

    console.log('[generateEstimate] sections', sections)

    // Parse materials section
    const materialsSection = sections.find(s => s.includes('MATERIALS BREAKDOWN'))
    if (materialsSection) {
      estimate.breakdown.materials = materialsSection
        .split('\n')
        .filter(l => l.includes('$'))
        .map(l => {
          const [item, cost] = l.split('$')
          const parsedCost = parseFloat(cost?.replace(/[^0-9.]/g, '') || '0')
          return {
            item: item?.trim() || '',
            cost: parsedCost
          }
        })
    }

    console.log('[generateEstimate] materialsSection', materialsSection, estimate.breakdown.materials)

    // Parse labor section
    const laborSection = sections.find(s => s.includes('LABOR COSTS'))
    if (laborSection) {
      const lines = laborSection.split('\n')
      let skillLevel = ''
      let rate = 0
      let hours = 0

      // Extract skill level, rate, and hours from the section
      for (const line of lines) {
        if (line.includes('Skill level:')) {
          skillLevel = line.split(':')[1]?.trim() || ''
        } else if (line.includes('Rate: $')) {
          rate = parseFloat(line.split('$')[1]?.replace(/[^0-9.]/g, '') || '0')
        } else if (line.includes('Hours needed:')) {
          hours = parseFloat(line.split(':')[1]?.replace(/[^0-9.]/g, '') || '0')
        }
      }

      // Create a single labor entry with the extracted values
      if (rate > 0 && hours > 0) {
        estimate.breakdown.labor = [{
          task: `${skillLevel} labor`,
          description: `${skillLevel} labor`,
          rate,
          hours
        }]
      }
    }

    console.log('[generateEstimate] laborSection', laborSection, estimate.breakdown.labor)

    // Parse other costs
    const otherSection = sections.find(s => s.includes('OTHER COSTS'))
    if (otherSection) {
      const lines = otherSection.split('\n')
      estimate.breakdown.permits = parseFloat(lines.find(l => l.includes('Permits'))?.split('$')[1]?.replace(/[^0-9.]/g, '') || '0')
      estimate.breakdown.management = parseFloat(lines.find(l => l.includes('Management'))?.split('$')[1]?.replace(/[^0-9.]/g, '') || '0')
      estimate.breakdown.contingency = parseFloat(lines.find(l => l.includes('Contingency'))?.split('$')[1]?.replace(/[^0-9.]/g, '') || '0')
    }

    console.log('[generateEstimate] otherSection', otherSection, estimate.breakdown)

    // Calculate total estimate by summing all components
    const materialTotal = estimate.breakdown.materials.reduce((sum, item) => sum + item.cost, 0)
    const laborTotal = estimate.breakdown.labor.reduce((sum, item) => sum + item.rate * item.hours, 0)
    estimate.totalEstimate = materialTotal + laborTotal + 
      estimate.breakdown.permits + 
      estimate.breakdown.management + 
      estimate.breakdown.contingency

    // Parse assumptions
    const assumptionsSection = sections.find(s => s.includes('ASSUMPTIONS'))
    if (assumptionsSection) {
      estimate.assumptions = assumptionsSection
        .split('\n')
        .filter(l => l.startsWith('-'))
        .map(l => l.slice(1).trim())
    }

    return {
      analysis,
      estimate
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

    // Parse the suggestions from the response
    const suggestions = this.parseSuggestions(content)
    return { suggestions: suggestions.slice(0, params.maxSuggestions) }
  }

  private parseSuggestions(content: string): Array<ProjectSuggestion> {
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
} 