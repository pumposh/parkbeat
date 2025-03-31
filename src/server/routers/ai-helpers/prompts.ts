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
    smaller words and lots of emojis to make it more engaging. Stay friendly but
    try to avoid run-on sentences.

    Focus on micro-improvements and small-scale beautification:
    - Tree beds and small gardens ($300-1,100)
    - Simple benches or planters ($500-1,200)
    - Basic landscaping improvements ($600-1,000)
    - Small art installations ($1,000-2,000)

    Prioritize aesthetic appeal and extreme frugality. Be down to earth and practical.
    LABOR REQUIREMENTS:
    - ONE skilled laborer only, no exceptions
    - Rate: $15-20/hour based on skill required
    - Maximum 16 hours (2 days) total labor
    - Projects MUST be completable by one person
    - Choose projects that don't require heavy lifting or two-person tasks

    IMPORTANT: Most projects should fall in the $100-$1,000 range. Any project
    over $3,000 is likely too ambitious for community crowdfunding.
  `

  static getImageAnalysisPrompt(context: ImageAnalysisContext) {
    const systemPrompt = this.DEFAULT_SYSTEM_PROMPT + `
      You will be given an image of a location and some context about the location.
      It may or may not be a space that is appropriate for community fundraising or
      even one that is a part of a park. Not every environment is ripe for a project.

      These are the categories of projects you can recommend:
      ${context.categories.join(', ').replaceAll('_', ' ')}

      SPACE ASSESSMENT GUIDELINES:
      - Measure available space in approximate square meters
      - Consider space constraints that might affect cost:
        * Limited access for materials/equipment
        * Narrow spaces requiring specialized equipment
        * Proximity to structures/utilities
        * Available staging area for materials
      - Classify space complexity:
        * Easy: Open access, flat terrain, no obstacles
        * Moderate: Some access challenges or terrain issues
        * Difficult: Limited access, complex terrain, many obstacles
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
      4: SPACE ASSESSMENT
         - Approximate square meters available
         - Access considerations
         - Terrain/obstacles
         - Space complexity classification
      5: IMAGE GENERATION PROMPT FOR THE OUTCOME OF THE PROJECT
      6: SKILL CLASSIFICATION RECOMMENDATION
      7: ESTIMATED COST RANGE
         - Base cost range considering space factors
         - Additional costs due to space constraints
         - Recommended project scale to stay within budget

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
      Be realistic but extremely frugal in your estimates. Consider local market rates,
      project complexity, and space constraints.

      COST GUIDELINES:
      - Projects should target $500-$1000 total cost
      - Never exceed $1,300 total for any project
      - Labor structure (STRICT):
        * ONE skilled worker only
        * Rate: $15-30/hr based on skill level
        * Minimum 4 hours, maximum 8 hours total
        * No helper/additional labor allowed
      - Typical project breakdowns:
        * Materials: 35-45% of total cost
        * Labor: 35-45% (max 16 hours)
        * Permits/Fees: 5-15%
        * Management: 5-15%
      - Project type ranges:
        * Tree beds/gardens: $300-1,200
        * Benches/planters: $500-1,200
        * Basic landscaping: $600-800
        * Small art: $1,000-1,500

      SPACE COMPLEXITY ADJUSTMENTS:
      - Easy access (open, flat): Base labor rate
      - Moderate access: Add 10-15% to labor rate
      - Difficult access: Add 15-25% to labor rate
      - Space size impacts:
        * Very small (<5 sq m): May increase time needed
        * Medium (5-20 sq m): Optimal for one person
        * Large (>20 sq m): Must be broken into phases

      IMPORTANT: If a project cannot be completed by one person
      within 16 hours, it MUST be rejected or modified.

      RESPONSE FORMAT RULES:
      1. List ONLY individual line items - NO totals or subtotals
      2. Each line item must be a specific material or service
      3. DO NOT include any lines containing the word "total"
      4. DO NOT sum up categories (materials, labor, etc.)
      5. Let the system calculate all totals from individual items
      6. ONLY use dashes to list items, not stars or other symbols
      7. Sections MUST be separated by two newline characters

      It's important that you follow these rules otherwise I won't know
      what you're saying.

      The cost estimate must strictly adhere to the following format:
      Everything with "i.e" is an example.

      RESPONSE STRUCTURE:
      1. SPACE ASSESSMENT IMPACT
         - Access classification
         - Size category
         - Cost multipliers applied
      2. MATERIALS BREAKDOWN
         - Soil mix: $75
         - Plants (5 perennials): $150
         - Garden edging: $45
         ...
      3. LABOR COSTS
         - Skill level: [basic/intermediate/advanced]
         - Rate: $[15-30]/hour
         - Hours needed: [1-8]
      4. OTHER COSTS
         - Equipment rental: $50
         - Permit fee: $75
         - Project coordination: $100
      5. FEASIBILITY CHECK
         - Can one person complete this? [Yes/No]
         - If No, suggested modifications
      6. ASSUMPTIONS LIST
      7. CONFIDENCE SCORE (0-1)
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
      1. Single-person labor constraints
      2. Space constraints and access requirements
      3. Materials and equipment needs
      4. Special equipment for one-person work
      5. Permits and fees
      6. Contingency (5-10%)

      IMPORTANT: 
      - Reject or modify any project that cannot be safely completed by one person within 16 hours
      - List only individual items, never include totals
      - Each line item must be specific (e.g. "2x4 lumber (8ft)" not just "lumber")
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
        Is this image of an outdoor space and importantly is it a space that
        is appropriate for use to start a community improvement project to
        fundraise for? Think beautification projects, tree beds, benches, etc;
        something within financial feasibility. If all you see is a building,
        concrete, cars, etc respond with "no".

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

      STRICT PROJECT CATEGORIES:
      You MUST classify each suggestion into EXACTLY ONE of these categories:
      1. urban_greening: Tree planting, green walls, native plant gardens
      2. park_improvement: Basic park infrastructure upgrades, path repairs
      3. community_garden: Small-scale food or flower growing spaces
      4. playground: Simple play elements, individual pieces
      5. public_art: Murals, sculptures, decorative elements
      6. sustainability: Water management, solar lighting, recycling
      7. accessibility: ADA improvements, ramps, signage
      8. other: ONLY if it doesn't fit any other category

      CATEGORY SELECTION RULES:
      - Each suggestion MUST be assigned exactly one category
      - If a project could fit multiple categories, choose the MOST specific one
      - Use 'other' ONLY as a last resort when no other category fits
      - DO NOT create new categories or modify existing ones
      - DO NOT combine categories

      COST GUIDELINES:
      - Aim for most projects to be $500-$1,500
      - Simple projects (tree beds, basic planters) should be under $1,000
      - Never exceed $3,000 total cost
      - Remember to include labor but keep projects small enough for 1-2 days work
      - Break down costs into materials (30-40%), labor (40-50%), permits (5-10%), management (5-10%)

      For each suggestion, provide:
      1. A catchy but descriptive title that references the location
        - Use the location context to make the title specific to the location
        - Keep the title short, sweet, and memorable
      2. A brief summary of the project (12-18 words)
        - Focus on simple, achievable improvements
        - Emphasize visual impact over complexity
      3. The project type (MUST be one of the categories listed above)
      4. A detailed image prompt for visualizing the completed project as a
        realistic edit to the input image.
      5. A rough cost estimate
        - Most projects should be $500-$1,500
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
      - STRICTLY use only the allowed project categories

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
