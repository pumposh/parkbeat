import { GenerativeModel, GoogleGenerativeAI } from "@google/generative-ai"
import type { ProjectCategory } from "@/types/types"
import { PromptManager } from "./prompts"
import { Context } from "hono"
import { env } from "hono/adapter"
import { Env } from "./types"
import { generateId } from "@/lib/id"
import { LeonardoAgent, ImageGenerationAgent } from './leonardo-agent'
import { parseCostValue } from "@/lib/cost"
import type { 
  CostBreakdown,
  BaseCostItem, 
  LaborCostItem,
  AIEstimateResult
} from "@/server/types/shared"

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
    breakdown?: CostBreakdown
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

// Now directly implementing AIAgent
export class GeminiAgent implements AIAgent {
  private model: GenerativeModel

  constructor(apiKey: string) {
    const genAI = new GoogleGenerativeAI(apiKey)
    this.model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
  }

  // Helper methods for parsing responses  
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
      console.error('Error parsing suggestions:', error)
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

    // Split the response into sections based on numbered headers
    const sections = response.split(/\d+\.\s+/).filter(Boolean)
    
    // Extract section by title (case insensitive)
    const findSection = (title: string): string | undefined => {
      return sections.find(s => 
        s.trim().toUpperCase().startsWith(title.toUpperCase())
      )
    }
    
    // Parse materials section
    const materialsSection = findSection('MATERIALS BREAKDOWN')
    if (materialsSection) {
      const materialItems: BaseCostItem[] = materialsSection
        .split('\n')
        .filter(l => l.includes('$') || (l.includes(':') && /\d+/.test(l)))
        .map(l => {
          // Handle different formats: either "item: $cost" or "item: cost"
          let item = '', cost = '0'
          
          if (l.includes('$')) {
            const parts = l.split('$')
            item = (parts[0] || '').replace(':', '').trim()
            cost = parts[1]?.trim() || '0'
          } else if (l.includes(':')) {
            const parts = l.split(':')
            item = (parts[0] || '').trim()
            cost = parts[1]?.trim() || '0'
          }
          
          const costValue = parseFloat(cost.replace(/[^0-9.]/g, '') || '0')
          const hasCents = (costValue - Math.floor(costValue)) !== 0;
          const costString = hasCents ? `$${costValue.toFixed(2)}` : `$${costValue.toFixed(0)}`;
          return {
            item: item.replace(/^-\s*/, ''),
            cost: costString,
            isIncluded: true
          }
        })
        .filter(item => item.item && item.item.toLowerCase() !== 'total') // Filter out total entries
      
      estimate.breakdown.materials = {
        items: materialItems,
        total: materialItems.reduce((sum: number, item: BaseCostItem) => 
          sum + parseCostValue(item.cost), 0)
      }
    }

    // Parse labor section
    const laborSection = findSection('LABOR COSTS')
    if (laborSection) {
      // Check for rate and hours format
      const rateMatch = /rate:?\s*\$?(\d+\.?\d*)/i.exec(laborSection)
      const hoursMatch = /hours:?\s*(\d+\.?\d*)/i.exec(laborSection)
      const skillMatch = /skill level:?\s*([a-z]+)/i.exec(laborSection)
      
      if (rateMatch && hoursMatch) {
        const rate = parseFloat(rateMatch[1] || '0')
        const hours = parseFloat(hoursMatch[1] || '0')
        const skill = skillMatch && skillMatch[1] ? skillMatch[1].trim() : 'basic'
        
        const laborItems: LaborCostItem[] = [{
          task: 'Project labor',
          description: `${skill} labor for project completion`,
          rate,
          hours,
          isIncluded: true
        }]
        
        estimate.breakdown.labor = {
          items: laborItems,
          total: rate * hours
        }
      } else {
        // Fallback to older parsing method
        const laborItems: LaborCostItem[] = laborSection
          .split('\n')
          .filter(l => l.includes('$') || (l.includes(':') && /\d+/.test(l)))
          .map(l => {
            let task = '', rate = 0, hours = 0
            
            if (l.toLowerCase().includes('rate')) {
              const rateValue = parseFloat(l.replace(/[^0-9.]/g, '') || '0')
              return {
                task: 'Hourly rate',
                description: 'Labor hourly rate',
                rate: rateValue,
                hours: 0,
                isIncluded: true
              }
            } else if (l.toLowerCase().includes('hours')) {
              const hoursValue = parseFloat(l.replace(/[^0-9.]/g, '') || '0')
              return {
                task: 'Labor hours',
                description: 'Total labor hours',
                rate: 0,
                hours: hoursValue,
                isIncluded: true
              }
            }
            
            return {
              task,
              description: task,
              rate,
              hours,
              isIncluded: true
            }
          })
          .filter(item => (item.rate > 0 || item.hours > 0))
        
        // Calculate total - if we have exactly one rate item and one hours item
        const rateItem = laborItems.find(item => item.rate > 0 && item.hours === 0)
        const hoursItem = laborItems.find(item => item.hours > 0 && item.rate === 0)
        
        if (rateItem && hoursItem) {
          // Create a consolidated labor item
          estimate.breakdown.labor = {
            items: [{
              task: 'Project labor',
              description: 'Labor for project completion',
              rate: rateItem.rate,
              hours: hoursItem.hours,
              isIncluded: true
            }],
            total: rateItem.rate * hoursItem.hours
          }
        } else {
          estimate.breakdown.labor = {
            items: laborItems,
            total: laborItems.reduce((sum: number, item: LaborCostItem) => 
              sum + (item.rate * item.hours), 0)
          }
        }
      }
    }

    // Parse other costs (including permits, management, contingency)
    const otherSection = findSection('OTHER COSTS')
    if (otherSection) {
      const otherItems: BaseCostItem[] = otherSection
        .split('\n')
        .filter(l => l.includes('$') || (l.includes(':') && /\d+/.test(l)))
        .map(l => {
          let item = '', cost = '0'
          
          if (l.includes('$')) {
            const parts = l.split('$')
            item = (parts[0] || '').replace(':', '').trim()
            cost = parts[1]?.trim() || '0'
          } else if (l.includes(':')) {
            const parts = l.split(':')
            item = (parts[0] || '').trim()
            cost = parts[1]?.trim() || '0'
          }
          
          const costValue = parseFloat(cost.replace(/[^0-9.]/g, '') || '0')
          const hasCents = (costValue - Math.floor(costValue)) !== 0;
          const costString = hasCents ? `$${costValue.toFixed(2)}` : `$${costValue.toFixed(0)}`;
          return {
            item: item.replace(/^-\s*/, ''),
            cost: costString,
            isIncluded: true
          }
        })
        .filter(item => item.item && item.item.toLowerCase() !== 'total') // Filter out total entries
      
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
    const assumptionsSection = findSection('ASSUMPTIONS')
    if (assumptionsSection) {
      estimate.assumptions = assumptionsSection
        .split('\n')
        .filter(l => l.trim().startsWith('-'))
        .map(l => l.replace(/^-\s*/, '').trim())
    } else {
      // Check for assumptions in a standard numbered format
      const assumptionsLines = response.split('\n').filter(l => 
        l.trim().match(/^-\s/) && 
        !l.includes('$') && 
        !l.includes(':')
      )
      if (assumptionsLines.length > 0) {
        estimate.assumptions = assumptionsLines.map(l => l.replace(/^-\s*/, '').trim())
      }
    }

    // Parse confidence score
    const confidenceLine = response.split('\n').find(l => l.toLowerCase().includes('confidence score'))
    if (confidenceLine) {
      const scoreMatch = /(\d+\.?\d*)/g.exec(confidenceLine || '')
      if (scoreMatch && scoreMatch[1]) {
        const score = parseFloat(scoreMatch[1])
        // Normalize to 0-1 range if needed
        estimate.confidenceScore = score > 1 ? score / 10 : score
      }
    }

    console.log('Parsed estimate:', JSON.stringify(estimate, null, 2))
    return estimate;
  }

  // Implementations remain the same

  async analyzeImage({ imageUrl, locationContext, userContext }: {
    imageUrl: string
    locationContext?: string
    userContext?: string
  }): Promise<AIAnalysisResult> {
    // First check if this is an appropriate outdoor space
    const initialCheckPrompt = PromptManager.getInitialSpaceCheckPrompt()
    const initialCheck = await this.model.generateContent([
      imageUrl,
      initialCheckPrompt.systemPrompt,
      initialCheckPrompt.userPrompt
    ])
    const checkResponse = initialCheck.response.text()
    const isNotOutdoorSpace = checkResponse.split('\n')[0]?.includes('NO') ?? false
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
      model: this.model.model,
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
      analysisPrompt.systemPrompt,
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
        labor: parseFloat(costLines.find((l: string) => l.includes('Labor'))?.split('$')[1]?.replace(/[^0-9.]/g, '') || '0'),
        total: parseFloat(costLines.find((l: string) => l.includes('Total'))?.split('$')[1]?.replace(/[^0-9.]/g, '') || '0')
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
      model: this.model.model,
      description,
      category: category as ProjectCategory,
      scope
    })

    const result = await this.model.generateContent([
      prompt.systemPrompt,
      prompt.userPrompt
    ])

    const analysis = result.response.text()
    
    console.info(`[generateEstimate] Analysis: ${analysis}`)

    // Use base class parsing logic
    const estimate = this.parseEstimateFromResponse(analysis)

    console.info(`[generateEstimate] Estimate: ${estimate}`)

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
    const prompt = PromptManager.getInitialSpaceCheckPrompt()
    
    const result = await this.model.generateContent([
      imageUrl,
      prompt.systemPrompt,
      prompt.userPrompt
    ])

    const content = result.response.text()
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
      model: this.model.model,
      locationContext: params.locationContext,
      userContext: params.images.map(img => img.userContext).filter(Boolean).join('\n'),
      maxSuggestions: params.maxSuggestions
    })

    // Create content array for Gemini API
    const contentArray = [prompt.systemPrompt, prompt.userPrompt]
    
    // Add each image to the content array
    for (const image of params.images) {
      contentArray.push(image.imageUrl)
    }

    const response = await this.model.generateContent(contentArray)
    const content = response.response.text()
    
    if (!content) {
      throw new Error('No response from Gemini')
    }

    // Use base class parsing logic
    const suggestions = this.parseSuggestions(content)
    return { suggestions: suggestions.slice(0, params.maxSuggestions) }
  }

  generateReimagination?(params: {
    imageUrl: string
    prompt: string
    projectContext?: string
  }): Promise<{
    urls: string[]
    generationId: string
  }> {
    throw new Error('Method not implemented')
  }
}

// Example of how another provider could be implemented:
/*
export class AnthropicAgent implements AIAgent {
  constructor(apiKey: string) {
    // Initialize Claude
  }

  // Implementations...
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
      // Import OpenAIAgent dynamically to avoid circular dependency
      const { OpenAIAgent } = require('./openai-agent')
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
