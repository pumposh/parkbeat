import { GoogleGenerativeAI } from "@google/generative-ai"
import type { ProjectCategory } from "@/types/types"
import { PromptManager } from "./prompts"
import { OpenAIAgent } from './openai-agent'
import { Context } from "hono"
import { env } from "hono/adapter"
import { Env } from "./types"
import { generateId } from "@/lib/id"
import { LeonardoAgent, ImageGenerationAgent } from './leonardo-agent'

// Core output interfaces that serve as source of truth
export interface ProjectRecommendation {
  title: string
  projectTypes: ProjectCategory[]
  description: string
  imagePrompt: string
  skillClassification: string
  estimatedCosts: {
    materials: Array<{ name: string; cost: number }>
    labor: number
    total: number
  }
}

export interface ProjectVision {
  description: string
  existingElements: string[]
  newElements: string[]
  communityBenefits: string[]
  maintenanceConsiderations: string[]
  imagePrompt?: string
  imageUrl?: string
}

export interface ProjectEstimate {
  totalEstimate: number
  breakdown: {
    materials: Array<{ item: string; cost: number }>
    labor: Array<{ task: string; cost: number }>
    permits: number
    management: number
    contingency: number
  }
  assumptions: string[]
  confidenceScore: number
}

export interface ProjectSuggestion {
  id: string
  title: string
  summary: string | null
  imagePrompt: string
  category: ProjectCategory | string
  estimatedCost?: {
    total: number
    breakdown?: {
      materials: Array<{ item: string; cost: number }>
      labor: Array<{ task: string; rate: number; hours: number }>
      permits: number
      management: number
      contingency: number
    }
  }
  images?: {
    generated: Array<{
      url: string
      generatedAt: string
      generationId: string
    }>
    source?: {
      url?: string
      id?: string
    }
    upscaled?: {
      url?: string
      id?: string
      upscaledAt?: string
    }
  }
  metadata?: Record<string, any>
}

// Main interface results that use the core interfaces
export interface AIAnalysisResult {
  isOutdoorSpace: boolean
  description: string
  analysis: string
  suggestions?: ProjectSuggestion[]
}

export interface AIEstimateResult {
  totalEstimate: number
  breakdown: {
    materials: Array<{ item: string; cost: number }>
    labor: Array<{ task: string; description: string; rate: number; hours: number }>
    permits: number
    management: number
    contingency: number
  }
  assumptions: string[]
  confidenceScore: number
}

// Main AI Agent interface
export interface AIAgent {
  analyzeImage(params: {
    imageUrl: string
    locationContext?: string
    userContext?: string
  }): Promise<AIAnalysisResult>

  analyzeImages(params: {
    images: Array<{
      imageUrl: string
      locationContext?: string
      userContext?: string
    }>
    maxSuggestions: number
    locationContext?: string
  }): Promise<{
    suggestions: Array<ProjectSuggestion>
  }>

  validateImage(params: {
    imageUrl: string
  }): Promise<{
    isValid: boolean
    isMaybe: boolean
    description: string
    error?: string
  }>

  generateImage(params: {
    prompt: string
    originalImage: string
  }): Promise<{
    url: string
  }>

  generateEstimate(params: {
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
  }>

  generateReimagination?(params: {
    imageUrl: string
    prompt: string
    projectContext?: string
  }): Promise<{
    urls: string[]
    generationId: string
  }>
}

// Gemini implementation
export class GeminiAgent implements AIAgent {
  private model: any
  private visionModel: any

  constructor(apiKey: string) {
    const genAI = new GoogleGenerativeAI(apiKey)
    this.model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' })
    this.visionModel = genAI.getGenerativeModel({ model: 'gemini-pro-vision' })
  }

  async analyzeImage({ imageUrl, locationContext, userContext }: {
    imageUrl: string
    locationContext?: string
    userContext?: string
  }): Promise<AIAnalysisResult> {
    // First check if this is an appropriate outdoor space
    const initialCheckPrompt = PromptManager.getInitialSpaceCheckPrompt()
    const initialCheck = await this.model.generateContent([
      imageUrl,
      initialCheckPrompt.userPrompt
    ])
    const checkResponse = initialCheck.response.text()
    const isNotOutdoorSpace = checkResponse.split('\n')[0].includes('NO')
    const description = checkResponse.split('\n')[1] || 'No description available'

    if (isNotOutdoorSpace) {
      return {
        isOutdoorSpace: false,
        description,
        analysis: "This space doesn't appear suitable for a community project."
      }
    }

    // If appropriate, generate full analysis
    const analysisPrompt = PromptManager.getImageAnalysisPrompt({
      model: 'gemini-1.5-pro',
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

    const result = await this.model.generateContent([
      imageUrl,
      analysisPrompt.userPrompt
    ])

    const analysis = result.response.text()
    
    // Parse the structured response into recommendation object
    const lines = analysis.split('\n')
    const recommendation: ProjectRecommendation = {
      title: lines.find((l: string) => l.startsWith('2:'))?.slice(2).trim() || 'Project Recommendation',
      projectTypes: [lines.find((l: string) => l.startsWith('1:'))?.slice(2).trim() as ProjectCategory || 'other'],
      description: lines.find((l: string) => l.startsWith('3:'))?.slice(2).trim() || analysis,
      imagePrompt: lines.find((l: string) => l.startsWith('4:'))?.slice(2).trim() || '',
      skillClassification: lines.find((l: string) => l.startsWith('5:'))?.slice(2).trim() || 'beginner',
      estimatedCosts: {
        materials: [],
        labor: 0,
        total: 0
      }
    }

    // Parse cost section
    const costSection = analysis.split('6: ESTIMATED COST')[1]
    if (costSection) {
      const costLines = costSection.split('\n').filter((l: string) => l.includes('$'))
      recommendation.estimatedCosts = {
        materials: costLines
          .filter((l: string) => !l.includes('Labor') && !l.includes('Total'))
          .map((l: string) => {
            const [name, cost] = l.split('$')
            return {
              name: name?.trim() || '',
              cost: parseFloat(cost?.replace(/[^0-9.]/g, '') || '0') || 0
            }
          }),
        labor: parseFloat(costLines.find((l: string) => l.includes('Labor'))?.split('$')[1].replace(/[^0-9.]/g, '') || '0'),
        total: parseFloat(costLines.find((l: string) => l.includes('Total'))?.split('$')[1].replace(/[^0-9.]/g, '') || '0')
      }
    }

    return {
      isOutdoorSpace: true,
      description,
      analysis,
      suggestions: [{
        id: generateId(),
        title: recommendation.title,
        summary: recommendation.description,
        imagePrompt: recommendation.imagePrompt,
        category: recommendation.projectTypes[0] as ProjectCategory,
        estimatedCost: {
          total: recommendation.estimatedCosts.total,
        }
      }]
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
      model: 'gemini-1.5-pro',
      description,
      category: category as ProjectCategory,
      scope
    })

    const result = await this.model.generateContent([
      prompt.userPrompt
    ])

    const analysis = result.response.text()
    
    // Parse the response into structured estimate object
    const sections = analysis.split('\n\n')
    const estimate: {
      totalEstimate: number
      breakdown: {
        materials: Array<{ item: string; cost: number }>
        labor: Array<{ task: string; description: string; rate: number; hours: number }>
        permits: number
        management: number
        contingency: number
      }
      assumptions: string[]
      confidenceScore: number
    } = {
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

    // Parse materials section
    const materialsSection = sections.find((s: string) => s.includes('MATERIALS BREAKDOWN'))
    if (materialsSection) {
      estimate.breakdown.materials = materialsSection
        .split('\n')
        .filter((l: string) => l.includes('$'))
        .map((l: string) => {
          const [name, cost] = l.split('$')
          return {
            item: name?.trim() || '',
            cost: parseFloat(cost?.replace(/[^0-9.]/g, '') || '0') || 0
          }
        })
    }

    // Parse labor section
    const laborSection = sections.find((s: string) => s.includes('LABOR COSTS'))
    if (laborSection) {
      estimate.breakdown.labor = laborSection
        .split('\n')
        .filter((l: string) => l.includes('$'))
        .map((l: string) => {
          const [type, details] = l.split(':')
          const [rate, hours] = details?.split('x').map((s: string) => parseFloat(s.replace(/[^0-9.]/g, ''))) || [0, 0]
          return {
            task: type?.trim() || '',
            rate,
            hours
          }
        })
    }

    // Parse other costs
    const otherSection = sections.find((s: string) => s.includes('OTHER COSTS'))
    if (otherSection) {
      const lines = otherSection.split('\n')
      estimate.breakdown.permits = parseFloat(lines.find((l: string) => l.includes('Permits'))?.split('$')[1].replace(/[^0-9.]/g, '') || '0')
      estimate.breakdown.management = parseFloat(lines.find((l: string) => l.includes('Management'))?.split('$')[1].replace(/[^0-9.]/g, '') || '0')
      estimate.breakdown.contingency = parseFloat(lines.find((l: string) => l.includes('Contingency'))?.split('$')[1].replace(/[^0-9.]/g, '') || '0')
    }

    // Parse total estimate
    const totalLine = analysis.split('\n').find((l: string) => l.includes('TOTAL ESTIMATE'))
    if (totalLine) {
      estimate.totalEstimate = parseFloat(totalLine.split('$')[1].replace(/[^0-9.]/g, '')) || 0
    }

    // Parse assumptions
    const assumptionsSection = sections.find((s: string) => s.includes('ASSUMPTIONS'))
    if (assumptionsSection) {
      estimate.assumptions = assumptionsSection
        .split('\n')
        .filter((l: string) => l.startsWith('-'))
        .map((l: string) => l.slice(1).trim())
    }

    // Parse confidence score
    const confidenceLine = analysis.split('\n').find((l: string) => l.includes('CONFIDENCE SCORE'))
    if (confidenceLine) {
      estimate.confidenceScore = parseFloat(confidenceLine.split(':')[1].trim()) || 0.8
    }

    return {
      analysis,
      estimate
    }
  }

  async validateImage({ imageUrl }: { imageUrl: string }): Promise<{
    isValid: boolean
    isMaybe: boolean
    description: string
    error?: string
  }> {
    // Implementation of validateImage method
    throw new Error('Method not implemented')
  }

  async generateImage({ prompt, originalImage }: { prompt: string, originalImage: string }): Promise<{ url: string }> {
    // Implementation of generateImage method
    throw new Error('Method not implemented')
  }

  async analyzeImages(params: {
    images: Array<{
      imageUrl: string
      locationContext?: string
      userContext?: string
    }>
    maxSuggestions: number
  }): Promise<{
    suggestions: Array<ProjectSuggestion>
  }> {
    // Implementation of analyzeImages method
    throw new Error('Method not implemented')
  }

  async generateReimagination({ imageUrl, prompt, projectContext }: {
    imageUrl: string
    prompt: string
    projectContext?: string
  }): Promise<{
    urls: string[]
    generationId: string
  }> {
    // Implementation of generateReimagination method
    throw new Error('Method not implemented')
  }
}

// Example of how another provider could be implemented:
/*
export class AnthropicAgent implements AIAgent {
  constructor(apiKey: string) {
    // Initialize Claude
  }

  async analyzeImage(params) {
    // Implementation using Claude
  }

  async generateVision(params) {
    // Implementation using Claude
  }

  async generateEstimate(params) {
    // Implementation using Claude
  }
}
*/

export type AIProvider = 'gemini' | 'anthropic' | 'openai'

export function createAIAgent(
  provider: AIProvider,
  c: Context
): AIAgent {
  const { GOOGLE_AI_API_KEY, OPENAI_API_KEY } = env<Env>(c)
  
  switch (provider) {
    case 'gemini':
      if (!GOOGLE_AI_API_KEY) {
        throw new Error('GEMINI_API_KEY is not set')
      }
      return new GeminiAgent(GOOGLE_AI_API_KEY)
    case 'anthropic':
      throw new Error('Anthropic implementation not yet available')
    case 'openai':
      if (!OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is not set')
      }
      return new OpenAIAgent(OPENAI_API_KEY)
    default:
      throw new Error(`Unknown AI provider: ${provider}`)
  }
}

export function createAIImageAgent(c: Context): ImageGenerationAgent {
  const { LEONARDO_API_KEY } = env<Env>(c)
  
  if (!LEONARDO_API_KEY) {
    throw new Error('LEONARDO_API_KEY is not set')
  }
  return new LeonardoAgent(LEONARDO_API_KEY)
}
