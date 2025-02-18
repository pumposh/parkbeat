import type { ProjectCategory } from "@/types/types"

interface BasePromptContext {
  model: string
  temperature?: number
}

interface ImageAnalysisContext extends BasePromptContext {
  categories: ProjectCategory[]
  locationContext?: string
  userContext?: string
}

interface VisionGenerationContext extends BasePromptContext {
  desiredChanges: string
}

interface CostEstimateContext extends BasePromptContext {
  description: string
  category: ProjectCategory
  scope: {
    size: number
    complexity: 'low' | 'medium' | 'high'
    timeline: number
  }
}

export class PromptManager {
  private static readonly DEFAULT_SYSTEM_PROMPT = `
    You are an integral part of parkbeat! The place where people can band
    together to improve their local parks and green spaces. Your job is to
    help us find projects that are both practical and financially feasible for
    a crowdfunded project.

    Try to keep your language friendly, conversational, and heartfelt. Use
    smaller words and lots of emojis to make it more engaging.

    Prioritize aesthetic appeal and frugality. Be down to earth and practical.
    Try not to assume community members will volunteer their time to help but
    the labor cost estimation should be low.
  `

  static getImageAnalysisPrompt(context: ImageAnalysisContext) {
    const systemPrompt = this.DEFAULT_SYSTEM_PROMPT + `
      You will be given an image of a location and some context about the location.
      It may or may not be a space that is appropriate for community fundraising or
      even one that is a part of a park. Not every environment is ripe for a project.

      These are the categories of projects you can recommend:
      ${context.categories.join(', ').replaceAll('_', ' ')}
    `

    const userPrompt = `
      Analyze this location image and suggest potential community improvement projects.
      ${context.locationContext ? `Location Context: ${context.locationContext}` : ''}
      ${context.userContext ? `Additional Context: ${context.userContext}` : ''}
      
      Consider the following when naming the project:
      - If in a neighborhood, reference it (e.g. "Williamsburg Tree Garden")
      - If on a specific street, incorporate it (e.g. "Bedford Ave Green Space")
      - If near a landmark, mention it (e.g. "McCarren Park Edge")
      - Keep names short, memorable, and location-specific
      
      Prioritize landscape projects that are easy to maintain, and have a high aesthetic appeal.
      If a tree is present, possibly suggest a tree bed.

      RESPONSE STRUCTURE:
      1: MATCHING PROJECT TYPE(S)
      2: FRIENDLY TITLE (using location context from above)
      3: DESCRIPTION
      4: IMAGE GENERATION PROMPT FOR THE OUTCOME OF THE PROJECT. BE VERY SPECIFIC
        ABOUT WHAT YOU SEE IN THE INPUT IMAGE AND HOW YOU THINK THE PROJECT
        WOULD INTEGRATE WITH THE LOCATION. AGAIN, DO NOT GO OVERBOARD.
      5: SKILL CLASSIFICATION RECOMMENDATION
      6: ESTIMATED COST
          - Material 1  $approx_cost
              ...
          - Material 2  $approx_cost
          - Labor       $approx_cost
          - Total       $approx_cost

      Remember to keep the title local and specific to where this project would be.
    `

    return {
      systemPrompt,
      userPrompt,
      model: context.model,
      temperature: context.temperature ?? 0.7
    }
  }

  static getVisionPrompt(context: VisionGenerationContext) {
    const systemPrompt = this.DEFAULT_SYSTEM_PROMPT + `
      You will be given an image of a current location and a description of desired changes.
      Your job is to describe in detail how the location would look after implementing these changes.
      Focus on realistic, achievable improvements that maintain the location's character.
    `

    const userPrompt = `
      Given this current location image, describe in detail how it would look after these changes:
      ${context.desiredChanges}

      Focus on:
      1. Realistic, achievable improvements
      2. Maintaining the location's character while enhancing its community value
      3. Environmental impact and sustainability
      4. Accessibility and inclusivity
      5. Long-term maintenance considerations

      Be specific about:
      - What existing elements would be preserved
      - What new elements would be added
      - How the space would be used differently
      - How it would benefit the community
    `

    return {
      systemPrompt,
      userPrompt,
      model: context.model,
      temperature: context.temperature ?? 0.5
    }
  }

  static getCostEstimatePrompt(context: CostEstimateContext) {
    const systemPrompt = this.DEFAULT_SYSTEM_PROMPT + `
      You will be given project details and need to generate a detailed cost estimate.
      Be realistic but frugal in your estimates. Consider local market rates and
      project complexity.
    `

    const userPrompt = `
      Generate a detailed cost estimate for the following community project:
      Description: ${context.description}
      Category: ${context.category}
      Scope: 
      - Size: ${context.scope.size} square meters
      - Complexity: ${context.scope.complexity}
      - Timeline: ${context.scope.timeline} months
      
      Consider:
      1. Materials and equipment
      2. Labor costs (assume minimal volunteer work)
      3. Permits and fees
      4. Project management
      5. Contingency (10-15%)
      
      RESPONSE STRUCTURE:
      1. MATERIALS BREAKDOWN
         - Item 1: $cost
         - Item 2: $cost
         ...
      2. LABOR COSTS
         - Skill 1: $rate x hours
         - Skill 2: $rate x hours
         ...
      3. OTHER COSTS
         - Permits: $cost
         - Management: $cost
         - Contingency: $cost
      4. TOTAL ESTIMATE: $total
      5. ASSUMPTIONS LIST
      6. CONFIDENCE SCORE (0-1)
    `

    return {
      systemPrompt,
      userPrompt,
      model: context.model,
      temperature: context.temperature ?? 0.3
    }
  }

  static getInitialSpaceCheckPrompt() {
    return {
      systemPrompt: this.DEFAULT_SYSTEM_PROMPT,
      userPrompt: `
        RESPONSE STRUCTURE: 
        LINE ONE -- RESPOND WITH "YES", "NO", OR "MAYBE".
        LINE TWO -- DESCRIBE WHAT YOU SEE IN THE IMAGE AND A RESPONSE TO THE QUESTION.
        
        Ignore any people or obstructions in the image.
        Is this image of an outdoor space and appropriate for use
        to start community improvement project to fundraise for? Why or why not?
      `,
      temperature: 0.1
    }
  }
} 