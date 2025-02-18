import OpenAI from 'openai'
import type { AIAgent, AIAnalysisResult, AIVisionResult, AIEstimateResult, ProjectVision } from './aigent'
import type { ProjectCategory } from "@/types/types"
import { PromptManager } from './prompts'

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

  async generateVision({ imageUrl, desiredChanges, initialDescription }: {
    imageUrl: string
    desiredChanges: string
    initialDescription: string
  }): Promise<AIVisionResult> {
    const prompt = PromptManager.getVisionPrompt({
      model: this.model,
      desiredChanges,
          })

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
      max_tokens: 1000
    })

    const content = result.choices[0]?.message?.content
    if (!content) {
      throw new Error('Failed to get vision description from OpenAI')
    }

    // Parse the response into structured sections
    const sections = content.split('\n\n')
    const vision: ProjectVision = {
      description: sections[0] || initialDescription,
      existingElements: sections.find((s: string) => s.toLowerCase().includes('existing'))
        ?.split('\n')
        .filter((l: string) => l.startsWith('-'))
        .map((l: string) => l.slice(1).trim()) || [],
      newElements: sections.find((s: string) => s.toLowerCase().includes('new'))
        ?.split('\n')
        .filter((l: string) => l.startsWith('-'))
        .map((l: string) => l.slice(1).trim()) || [],
      communityBenefits: sections.find((s: string) => s.toLowerCase().includes('benefit'))
        ?.split('\n')
        .filter((l: string) => l.startsWith('-'))
        .map((l: string) => l.slice(1).trim()) || [],
      maintenanceConsiderations: sections.find((s: string) => s.toLowerCase().includes('maintenance'))
        ?.split('\n')
        .filter((l: string) => l.startsWith('-'))
        .map((l: string) => l.slice(1).trim()) || [],
      imagePrompt: sections.find((s: string) => s.toLowerCase().includes('image prompt'))
        ?.split('\n')
        .filter((l: string) => !l.toLowerCase().includes('image prompt'))
        .join('\n')
        .trim()
    }

    return { vision }
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

    // If appropriate, generate full analysis
    const analysisPrompt = PromptManager.getImageAnalysisPrompt({
      model: this.model,
      categories: [
        'urban_greening',
        'park_improvement',
        'community_garden',
        'playground',
        'public_art',
        'sustainability',
        'accessibility',
        'other'
      ],
      locationContext,
      userContext
    })

    const result = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: 'system',
          content: analysisPrompt.systemPrompt
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: analysisPrompt.userPrompt },
            {
              type: 'image_url',
              image_url: { url: imageUrl }
            }
          ]
        }
      ],
      temperature: analysisPrompt.temperature,
      max_tokens: 1000
    })

    const analysis = result.choices[0]?.message?.content
    if (!analysis) {
      throw new Error('Failed to get analysis from OpenAI')
    }

    return {
      isOutdoorSpace: true,
      description,
      analysis,
      // recommendation would be parsed from analysis
    }
  }

  async generateEstimate({ description, category, scope }: {
    description: string
    category: ProjectCategory
    scope: {
      size: number
      complexity: 'low' | 'medium' | 'high'
      timeline: number
    }
  }): Promise<AIEstimateResult> {
    const prompt = PromptManager.getCostEstimatePrompt({
      model: this.textModel,
      description,
      category,
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

    return {
      analysis,
      estimate: {
        totalEstimate: 0, // Would be parsed from analysis
        breakdown: {
          materials: [],    // Would be parsed from analysis
          labor: [],
          permits: 0,
          management: 0,
          contingency: 0
        },
        assumptions: [],  // Would be parsed from analysis
        confidenceScore: 0.8
      }
    }
  }
} 