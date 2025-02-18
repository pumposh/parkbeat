import { aiRecommendations, costEstimates, projectImages, projects } from "@/server/db/schema"
import { desc, eq, and } from "drizzle-orm"
import { z } from "zod"
import { j, publicProcedure } from "../jstack"
import { generateId } from "@/lib/id"
import { env } from "hono/adapter"
import { Storage } from '@google-cloud/storage'
import { getLocationInfo } from "@/lib/location"
import { createAIAgent } from "./ai-helpers/aigent"
import type { ProjectCategory } from "@/types/types"
import type { InferInsertModel } from 'drizzle-orm'
import { Env } from "./ai-helpers/types"

// Project categories
const PROJECT_CATEGORIES = [
  'urban_greening',
  'park_improvement',
  'community_garden',
  'playground',
  'public_art',
  'sustainability',
  'accessibility',
  'other'
] as const

// Initialize GCP Storage
const createStorageClient = (credentials: {
  projectId: string,
  clientEmail: string,
  privateKey: string
}) => {
  return new Storage({
    projectId: credentials.projectId,
    credentials: {
      client_email: credentials.clientEmail,
      private_key: credentials.privateKey,
    }
  })
}

// Input validation schemas
const locationSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  radius: z.number().optional(), // Search radius in meters
})

const streetViewParamsSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  heading: z.number(),
  pitch: z.number(),
  zoom: z.number(),
})

const imageSourceSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('url'),
    url: z.string().url(),
  }),
  z.object({
    type: z.literal('streetView'),
    params: streetViewParamsSchema,
  })
])

const imageAnalysisSchema = z.object({
  id: z.string().optional(),
  imageSource: imageSourceSchema,
  projectId: z.string().optional(),
  context: z.string().optional(),
  fundraiserId: z.string(),
})

const projectVisionSchema = z.object({
  projectId: z.string(),
  currentImageSource: imageSourceSchema,
  desiredChanges: z.string(),
})

const costEstimateSchema = z.object({
  projectId: z.string(),
  description: z.string(),
  category: z.enum(PROJECT_CATEGORIES),
  scope: z.object({
    size: z.number(),
    complexity: z.enum(['low', 'medium', 'high']),
    timeline: z.number(),
  }),
})

// Enhanced error types for better debugging
const ValidationErrorCode = z.enum([
  'MISSING_API_KEYS',
  'INVALID_IMAGE_SOURCE',
  'PARSE_ERROR',
  'AI_VALIDATION_FAILED',
  'DB_ERROR',
  'INVALID_INPUT',
  'LOCATION_ERROR',
  'NETWORK_ERROR',
  'API_ERROR',
  'UNKNOWN_ERROR'
])

type ValidationErrorCode = z.infer<typeof ValidationErrorCode>

interface ValidationErrorResponse {
  code: ValidationErrorCode
  message: string
  details?: any
  type?: string
  path?: string[]
  cause?: Error | unknown
  timestamp?: string
  requestId?: string
}

// Error utility functions
function createError(
  code: ValidationErrorCode,
  message: string,
  details?: any,
  cause?: unknown
): ValidationErrorResponse {
  return {
    code,
    message,
    details,
    cause: cause instanceof Error ? cause : undefined,
    timestamp: new Date().toISOString(),
    requestId: generateId() // Unique ID for tracking this error instance
  }
}

function logError(context: string, error: ValidationErrorResponse) {
  console.error(`[${context}] ${error.code}: ${error.message}`, {
    ...error,
    timestamp: error.timestamp || new Date().toISOString(),
    stack: error.cause instanceof Error ? error.cause.stack : undefined
  })
}

// Enhanced validation schema with stricter types
const validateImageSchema = z.object({
  imageSource: imageSourceSchema,
  projectId: z.string().min(1, 'Project ID is required'),
  fundraiserId: z.string().min(1, 'Fundraiser ID is required'),
}).refine(
  (data) => {
    if (data.imageSource.type === 'streetView') {
      const { lat, lng, heading, pitch, zoom } = data.imageSource.params
      return (
        lat >= -90 && lat <= 90 &&
        lng >= -180 && lng <= 180 &&
        heading >= 0 && heading < 360 &&
        pitch >= -90 && pitch <= 90 &&
        zoom > 0
      )
    }
    return true
  },
  {
    message: 'Invalid street view parameters',
    path: ['imageSource.params']
  }
)

export const aiRouter = j.router({
  analyzeImage: publicProcedure
    .input(imageAnalysisSchema)
    .post(async ({ c, ctx, input }) => {
      try {
        console.log('Starting analyzeImage with input:', input)
        const { db } = ctx
        const { imageSource, projectId, context, fundraiserId } = input
        const { GOOGLE_AI_API_KEY, GOOGLE_MAPS_API_KEY } = env<Env>(c)
        
        if (!GOOGLE_AI_API_KEY || !GOOGLE_MAPS_API_KEY) {
          console.error('Missing required API keys')
          return c.json({ error: 'Missing required API configuration' }, 500)
        }

        // Get image URL based on source type
        const imageUrl = imageSource.type === 'url' 
          ? imageSource.url 
          : `https://maps.googleapis.com/maps/api/streetview?size=600x400&location=${imageSource.params.lat},${imageSource.params.lng}&heading=${imageSource.params.heading}&pitch=${imageSource.params.pitch}&fov=${90/imageSource.params.zoom}&key=${GOOGLE_MAPS_API_KEY}`

        // Get location info for better context
        const locationInfo = imageSource.type === 'streetView'
          ? await getLocationInfo(
              imageSource.params.lat,
              imageSource.params.lng
            )
          : null

        // Prepare rich location context
        const locationContext = locationInfo?.address ? [
          locationInfo.address.street && `Located on ${locationInfo.address.street}`,
          locationInfo.address.neighborhood && `in the ${locationInfo.address.neighborhood} neighborhood`,
          locationInfo.address.city && 
            (locationInfo.address.city.toLowerCase().includes('new york') 
              ? locationInfo.address.neighborhood 
              : `in ${locationInfo.address.city}`),
        ].filter(Boolean).join(' ') : ''

        // Initialize AI agent
        const agent = createAIAgent('openai', c)
        
        // Analyze image
        const result = await agent.analyzeImage({
          imageUrl,
          locationContext,
          userContext: context
        })

        if (!result.isOutdoorSpace) {
          return c.json({ error: result.analysis })
        }

        // Store image analysis if associated with a project
        if (projectId) {
          const [project] = await db
            .select()
            .from(projects)
            .where(eq(projects.id, projectId))
            .limit(1)

          if (!project) {
            throw new Error('Project not found')
          }

          await db.insert(projectImages).values({
            id: generateId(),
            project_id: projectId,
            type: 'current',
            image_url: imageUrl,
            ai_analysis: { 
              analysis: result.analysis,
              streetViewParams: imageSource.type === 'streetView' ? imageSource.params : undefined
            },
            metadata: { 
              context: locationContext,
              userContext: context
            }
          })
        }

        const existingRecommendationResult = await db
          .select()
          .from(aiRecommendations)
          .where(eq(aiRecommendations.fundraiser_id, fundraiserId))
        const existingRecommendation = existingRecommendationResult?.[0]

        // Create recommendation from analysis
        const recommendation = {
          id: input.id || generateId(),
          title: result.recommendation?.title || 'Project Recommendation',
          category: (result.recommendation?.projectTypes[0] || 'other') as ProjectCategory,
          estimated_cost: { 
            total: result.recommendation?.estimatedCosts.total || 0,
            ...result.recommendation?.estimatedCosts
          },
          description: result.recommendation?.description || result.analysis,
          confidence: '0.8',
          suggested_location: imageSource.type === 'streetView' ? {
            lat: imageSource.params.lat,
            lng: imageSource.params.lng,
            heading: imageSource.params.heading,
            pitch: imageSource.params.pitch,
            zoom: imageSource.params.zoom,
          } : null, 
          inspiration_images: [
            ...(Object.values(existingRecommendation?.inspiration_images ?? [])),
            imageUrl,
          ],
          reasoning_context: result.analysis,
          status: 'pending',
          fundraiser_id: fundraiserId,
        }

        // Store recommendation
        if (existingRecommendation) {
          await db.update(aiRecommendations)
            .set({
              ...recommendation,
              metadata: {
                ...(existingRecommendation.metadata ?? {}),
                updated_at: new Date()
              }
            })
            .where(eq(aiRecommendations.id, existingRecommendation.id))
        } else {
          await db.insert(aiRecommendations).values(recommendation)
        }

        return c.json({
          analysis: result.analysis,
          recommendation,
          imageUrl
        })
      } catch (error) {
        console.error('Error in analyzeImage:', error)
        throw error
      }
    }),

  validateImage: publicProcedure
    .input(validateImageSchema)
    .post(async ({ c, ctx, input }) => {
      const requestId = generateId()
      console.log(`[validateImage:${requestId}] Starting validation request`)

      try {
        const { db } = ctx
        const { imageSource, projectId, fundraiserId } = input
        const { GOOGLE_AI_API_KEY, GOOGLE_MAPS_API_KEY } = env<Env>(c)
        
        // Check API keys
        if (!GOOGLE_AI_API_KEY || !GOOGLE_MAPS_API_KEY) {
          const error = createError(
            'MISSING_API_KEYS',
            'System configuration error. Please contact support.',
            {
              missingKeys: {
                GOOGLE_AI_API_KEY: !GOOGLE_AI_API_KEY,
                GOOGLE_MAPS_API_KEY: !GOOGLE_MAPS_API_KEY
              }
            }
          )
          logError(`validateImage:${requestId}`, error)
          return c.json(error, 500)
        }

        // Get image URL based on source type
        let imageUrl: string
        try {
          imageUrl = imageSource.type === 'url' 
            ? imageSource.url 
            : `https://maps.googleapis.com/maps/api/streetview?size=600x400&location=${imageSource.params.lat},${imageSource.params.lng}&heading=${imageSource.params.heading}&pitch=${imageSource.params.pitch}&fov=${90/imageSource.params.zoom}&key=${GOOGLE_MAPS_API_KEY}`
        } catch (err) {
          const error = createError(
            'INVALID_IMAGE_SOURCE',
            'Unable to capture street view at this location.',
            { params: imageSource.type === 'streetView' ? imageSource.params : undefined },
            err
          )
          logError(`validateImage:${requestId}`, error)
          return c.json(error, 400)
        }

        // Initialize AI agent and validate
        let agent
        try {
          agent = createAIAgent('openai', c)
        } catch (err) {
          const error = createError(
            'API_ERROR',
            'Service temporarily unavailable. Please try again later.',
            undefined,
            err
          )
          logError(`validateImage:${requestId}`, error)
          return c.json(error, 500)
        }

        let validationResult
        try {
          validationResult = await agent.validateImage({ imageUrl })
        } catch (err) {
          const error = createError(
            'AI_VALIDATION_FAILED',
            'Unable to analyze the street view. Please try again.',
            { imageUrl },
            err
          )
          logError(`validateImage:${requestId}`, error)
          return c.json(error, 500)
        }

        if (!validationResult.isValid) {
          const error = createError(
            'INVALID_INPUT',
            validationResult.error || 'Invalid input',
            {
              description: validationResult.description,
              imageUrl
            }
          )
          error.type = 'invalid_input'
          logError(`validateImage:${requestId}`, error)
          return c.json(error, 400)
        }

        // Store initial image data
        try {
          await db.insert(projectImages).values({
            id: generateId(),
            project_id: projectId,
            type: 'initial',
            image_url: imageUrl,
            ai_analysis: { 
              description: validationResult.description,
              street_view_params: imageSource.type === 'streetView' ? imageSource.params : undefined
            },
            metadata: { 
              validatedAt: new Date().toISOString(),
              fundraiserId,
              requestId
            }
          })
        } catch (err) {
          const error = createError(
            'DB_ERROR',
            'Failed to save the validation result. Please try again.',
            { projectId, imageUrl },
            err
          )
          logError(`validateImage:${requestId}`, error)
        }

        console.log(`[validateImage:${requestId}] Validation successful`)
        return c.json({
          success: validationResult.isMaybe ? 'maybe' : validationResult.isValid ? 'yes' : 'no' as 'yes' | 'no' | 'maybe',
          description: validationResult.description,
          imageUrl,
          requestId
        })

      } catch (err) {
        // Catch-all for unexpected errors
        const error = createError(
          'UNKNOWN_ERROR',
          'An unexpected error occurred during validation.',
          err,
          err instanceof Error ? err : undefined
        )
        logError(`validateImage:${requestId}`, error)
        return c.json(error, 500)
      }
    }),

  generateProjectVision: publicProcedure
    .input(projectVisionSchema)
    .post(async ({ c, ctx, input }) => {
      const { db } = ctx
      const { projectId, currentImageSource, desiredChanges } = input
      const { GOOGLE_MAPS_API_KEY } = env<Env>(c)

      try {
        // Get the initial image analysis
        const initialImage = await db
          .select()
          .from(projectImages)
          .where(eq(projectImages.project_id, projectId))
          .orderBy(desc(projectImages.created_at))
          .limit(1)

        if (!initialImage[0]) {
          return c.json({ error: 'No validated image found for this project' }, 400)
        }

        const imageUrl = currentImageSource.type === 'url' && currentImageSource.url
          ? currentImageSource.url
          : currentImageSource.type === 'streetView' && currentImageSource.params
            ? `https://maps.googleapis.com/maps/api/streetview?size=600x400&location=${currentImageSource.params.lat},${currentImageSource.params.lng}&heading=${currentImageSource.params.heading}&pitch=${currentImageSource.params.pitch}&fov=${90/currentImageSource.params.zoom}&key=${GOOGLE_MAPS_API_KEY}`
            : null

        if (!imageUrl) {
          throw new Error('Invalid image source configuration')
        }

        const agent = createAIAgent('openai', c)
        const result = await agent.generateVision({
          imageUrl,
          desiredChanges,
          initialDescription: (initialImage[0].ai_analysis as { description: string }).description
        })

        // Store the vision
        const newProjectImage = {
          id: generateId(),
          project_id: projectId,
          type: 'vision',
          image_url: imageUrl,
          ai_generated_url: result.vision.imageUrl || null,
          aiAnalysis: {
            description: result.vision.description,
            existingElements: result.vision.existingElements,
            newElements: result.vision.newElements,
            community_benefits: result.vision.communityBenefits,
            maintenance_considerations: result.vision.maintenanceConsiderations,
            image_prompt: result.vision.imagePrompt,
            desired_changes: desiredChanges,
            street_view_params: currentImageSource.type === 'streetView' ? currentImageSource.params : undefined
          }
        }
        await db.insert(projectImages).values(newProjectImage)

        return c.json(result)
      } catch (error) {
        console.error('Error generating project vision:', error)
        throw error
      }
    }),

  generateCostEstimate: publicProcedure
    .input(costEstimateSchema)
    .post(async ({ c, ctx, input }) => {
      const { db } = ctx
      const { projectId, description, category, scope } = input
      const { GOOGLE_AI_API_KEY } = env<Env>(c)

      try {
        const agent = createAIAgent('openai', c)
        const result = await agent.generateEstimate({
          description,
          category,
          scope
        })

        // Store the estimate
        const newCostEstimate: InferInsertModel<typeof costEstimates> = {
          id: generateId(),
          project_id: projectId,
          version: '1',
          total_estimate: result.estimate.totalEstimate.toString(),
          breakdown: result.estimate.breakdown,
          assumptions: result.estimate.assumptions,
          confidence_scores: { overall: result.estimate.confidenceScore }
        }
        await db.insert(costEstimates).values(newCostEstimate)

        return c.json(result)
      } catch (error) {
        console.error('Error generating cost estimate:', error)
        throw error
      }
    }),

  // List recommendations endpoint remains unchanged
  listRecommendations: publicProcedure
    .input(z.object({
      status: z.enum(['pending', 'accepted', 'rejected']).optional(),
      category: z.enum(PROJECT_CATEGORIES).optional(),
      limit: z.number().min(1).max(50).default(20),
    }))
    .query(async ({ c, ctx, input }) => {
      const { db } = ctx
      const { status, category, limit } = input

      try {
        let baseQuery = db
          .select()
          .from(aiRecommendations)

        const conditions = [eq(aiRecommendations.fundraiser_id, 'user123')] // TODO: Get from auth

        if (status) {
          conditions.push(eq(aiRecommendations.status, status))
        }
        if (category) {
          conditions.push(eq(aiRecommendations.category, category))
        }

        const recommendations = await baseQuery
          .where(and(...conditions))
          .orderBy(desc(aiRecommendations.created_at))
          .limit(limit)

        return c.json({ recommendations })
      } catch (error) {
        console.error('Error listing recommendations:', error)
        throw error
      }
    }),
}) 