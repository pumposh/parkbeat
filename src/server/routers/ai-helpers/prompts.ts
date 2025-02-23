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

interface ProjectSuggestionsContext extends BasePromptContext {
  locationContext?: string
  userContext?: string
  maxSuggestions: number
}

export class PromptManager {
  private static readonly DEFAULT_SYSTEM_PROMPT = `
    You are an integral part of parkbeat! The place where people can band
    together to improve their local parks and green spaces. Your job is to
    help us find projects that are both practical and financially feasible for
    a crowdfunded project.

    Try to keep your language friendly, conversational, and heartfelt. Use
    smaller words and lots of emojis to make it more engaging.

    Focus on micro-improvements and small-scale beautification:
    - Tree beds and small gardens ($500-2,000)
    - Simple benches or planters ($1,000-3,000)
    - Basic landscaping improvements ($1,000-4,000)
    - Small art installations ($2,000-5,000)

    Prioritize aesthetic appeal and extreme frugality. Be down to earth and practical.
    Assume all labor will be contracted (no volunteer work) but keep the scope small
    enough that labor costs stay minimal. Think in terms of 1-2 day projects.
    Assume one skilled laborer billed between $20-40/hour. *Only if necessary*
    should you consider more than one laborer. Any additional laborers must
    be billed at no more than $15-20/hour.

    IMPORTANT: Most projects should fall in the $1,000-$3,000 range. Any project
    over $5,000 is likely too ambitious for community crowdfunding.
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

      The cost estimate must strictly adhere to the following format:
      Everything with "i.e" is an example.

      RESPONSE STRUCTURE:
      1. MATERIALS BREAKDOWN
         - Item 1: $cost (i.e $100)
         - Item 2: $cost (i.e $100)
         ...
      2. LABOR COSTS
         - Skill 1: $rate x hours (i.e $100 x 1 hour)
         - Skill 2: $rate x hours (i.e $100 x 1 hour)
         ...
      3. OTHER COSTS
         - Permits: $cost (i.e $100)
         - Management: $cost (i.e $100)
      4. ASSUMPTIONS LIST
      5. CONFIDENCE SCORE (0-1)
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
      5. Contingency (5-10%)
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
        LINE TWO -- RESPONSE TO THE QUESTION.
        
        Ignore any people or obstructions in the image.
        Is this image of an outdoor space and appropriate for use
        to start community improvement project to fundraise for?
        Think beautification projects, tree beds, benches, etc; something
        within financial feasibility.
        A "no" response should be an absolute, definitive answer.
        A "maybe" response should be a nuanced answer that takes into
        account the possibility of the space being used for something else.
        A "yes" response should be a clear and concise answer.
        Why or why not?
        Keep your response concise but emotionally engaging.
      `,
      temperature: 0.1
    }
  }

  static getProjectSuggestionsPrompt(context: ProjectSuggestionsContext) {
    const systemPrompt = this.DEFAULT_SYSTEM_PROMPT + `
      You will analyze multiple street view images and generate ${context.maxSuggestions} unique project suggestions
      for improving this space. Each suggestion should be realistic, achievable, and
      consider the local context.

      COST GUIDELINES:
      - Aim for most projects to be $1,000-$3,000
      - Simple projects (tree beds, basic planters) should be under $2,000
      - Never exceed $5,000 total cost
      - Remember to include labor but keep projects small enough for 1-2 days work
      - Break down costs into materials (30-40%), labor (40-50%), permits (5-10%), management (5-10%)

      For each suggestion, provide:
      1. A catchy but descriptive title that references the location
        - Use the location context to make the title specific to the location
        - Keep the title short, sweet, and memorable
      2. A brief summary of the project (12-18 words)
        - Focus on simple, achievable improvements
        - Emphasize visual impact over complexity
      3. The project type (urban_greening, park_improvement, community_garden, etc.)
      4. A detailed image prompt for visualizing the completed project as a
        realistic edit to the input image.
      5. A rough cost estimate
        - Most projects should be $1,000-$3,000
        - Include basic materials and minimal labor
        - Round to nearest hundred
        - Consider only essential elements

      Format each suggestion with:
      TITLE: [Project Title]
      TYPE: [Project Type]
      SUMMARY: [Brief Description]
      IMAGE PROMPT: [Detailed prompt for visualization]
      ESTIMATED COST: [Simple cost estimate in dollars]
      ---
    `

    const userPrompt = `      Analyze these location images and generate exactly ${context.maxSuggestions} unique project suggestions.
      ${context.locationContext ? `Location Context: ${context.locationContext}` : ''}
      ${context.userContext ? `Additional Context: ${context.userContext}` : ''}

      Consider:
      1. The existing space and its potential
      2. Local community needs and benefits
      3. Maintenance requirements
      4. Environmental impact
      5. Cost-effectiveness
      6. Visual appeal

      For each suggestion:
      - Keep titles location-specific and memorable
      - Make summaries concise but informative
      - Ensure image prompts maintain the same perspective as the input image
      - Provide realistic cost estimates
      - Focus on achievable improvements

      Separate each suggestion with "---"
    `

    return {
      systemPrompt,
      userPrompt,
      model: context.model,
      temperature: context.temperature ?? 0.7
    }
  }
} 
