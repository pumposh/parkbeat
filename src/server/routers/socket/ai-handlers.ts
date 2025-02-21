import { z } from "zod";
import { logger } from "@/lib/logger";
import { createAIAgent } from "../ai-helpers/aigent";

import { Env } from "../ai-helpers/types";
import { Env as JStackEnv } from "@/server/jstack";
import { generateId } from "@/lib/id";
import { costEstimates, projectImages } from "@/server/db/schema";
import { getLocationInfo } from "@/lib/location";
import { env } from "hono/adapter";
import type { publicProcedure } from "@/server/jstack";
import { ContextWithSuperJSON, Procedure } from "jstack";
import { eq, desc } from "drizzle-orm";
import { getTreeHelpers } from "../tree-helpers/context";

const streetViewParamsSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  heading: z.number(),
  pitch: z.number(),
  zoom: z.number(),
});

const imageSourceSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('url'),
    url: z.string().url(),
  }),
  z.object({
    type: z.literal('streetView'),
    params: streetViewParamsSchema,
  })
]);

// Client -> Server event schemas
export const aiClientEvents = {
  analyzeImage: z.object({
    imageSource: imageSourceSchema,
    projectId: z.string().optional(),
    context: z.string().optional(),
    fundraiserId: z.string(),
    requestId: z.string(),
  }),
  validateImage: z.object({
    imageSource: imageSourceSchema,
    projectId: z.string(),
    fundraiserId: z.string(),
    requestId: z.string(),
  }),
  generateProjectVision: z.object({
    projectId: z.string(),
    currentImageSource: imageSourceSchema,
    desiredChanges: z.string(),
    requestId: z.string(),
  }),
  generateCostEstimate: z.object({
    projectId: z.string(),
    description: z.string(),
    requestId: z.string(),
    category: z.enum([
      'urban_greening',
      'park_improvement',
      'community_garden',
      'playground',
      'public_art',
      'sustainability',
      'accessibility',
      'other'
    ] as const),
    scope: z.object({
      size: z.number(),
      complexity: z.enum(['low', 'medium', 'high']),
      timeline: z.number(),
    }),
  }),
  subscribeToProject: z.object({
    projectId: z.string(),
    shouldSubscribe: z.boolean(),
  }),
};

const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.any().optional(),
})

// Server -> Client event schemas
export const aiServerEvents = {
  imageAnalysis: z.object({
    projectId: z.string(),
    analysis: z.object({
      isOutdoorSpace: z.boolean(),
      description: z.string(),
      analysis: z.string(),
      suggestions: z.array(z.object({
        title: z.string(),
        summary: z.string(),
        imagePrompt: z.string(),
        generatedImageUrl: z.string().optional(),
      })).optional(),
    }),
  }),
  imageValidation: z.object({
    projectId: z.string(),
    requestId: z.string(),
    result: z.object({
      isValid: z.boolean(),
      isMaybe: z.boolean(),
      description: z.string(),
      error: errorSchema.optional(),
    }),
  }),
  projectVision: z.object({
    projectId: z.string(),
    requestId: z.string(),
    vision: z.union([
      z.object({
        description: z.string(),
        existingElements: z.array(z.string()),
        newElements: z.array(z.string()),
        communityBenefits: z.array(z.string()),
        maintenanceConsiderations: z.array(z.string()),
        imagePrompt: z.string().optional(),
        imageUrl: z.string().optional(),
      }),
      errorSchema
    ]),
  }),
  costEstimate: z.object({
    projectId: z.string(),
    requestId: z.string(),
    estimate: z.union([
      z.object({
        totalEstimate: z.number(),
        breakdown: z.object({
          materials: z.array(z.any()),
          labor: z.array(z.any()),
          permits: z.number(),
          management: z.number(),
          contingency: z.number(),
        }),
        assumptions: z.array(z.string()),
        confidenceScore: z.number(),
      }),
      errorSchema
    ]),
  }),
};

const clientEvents = z.object(aiClientEvents)
const serverEvents = z.object(aiServerEvents)
type ProcedureContext = Parameters<Parameters<typeof publicProcedure.ws>[0]>[0]['ctx']
type ProcedureEnv = ContextWithSuperJSON<JStackEnv>

type LocalProcedure = Procedure<JStackEnv, ProcedureContext, void, typeof clientEvents, typeof serverEvents>
type AISocket = Parameters<NonNullable<Awaited<ReturnType<Parameters<LocalProcedure["ws"]>[0]>>['onConnect']>>[0]['socket']
type AIIO = Parameters<Parameters<LocalProcedure["ws"]>[0]>[0]['io']

export const setupAIHandlers = (socket: AISocket, ctx: ProcedureContext, io: AIIO, c: ProcedureEnv) => {
  logger.info('Initializing AI WebSocket handler')
  const {
    notifyProjectSubscribers,
    getSocketId
  } = getTreeHelpers({ ctx, logger })


  // Image Analysis Handler
  socket.on('analyzeImage', async ({ requestId, imageSource, projectId, context, fundraiserId }) => {
    logger.info(`Processing image analysis for project: ${projectId || 'new'}`)
    try {
      const { GOOGLE_AI_API_KEY, GOOGLE_MAPS_API_KEY } = env<Env>(c)
      
      if (!GOOGLE_AI_API_KEY || !GOOGLE_MAPS_API_KEY) {
        throw new Error('Missing required API configuration')
      }

      const imageUrl = imageSource.type === 'url' 
        ? imageSource.url 
        : `https://maps.googleapis.com/maps/api/streetview?size=600x400&location=${imageSource.params.lat},${imageSource.params.lng}&heading=${imageSource.params.heading}&pitch=${imageSource.params.pitch}&fov=${90/imageSource.params.zoom}&key=${GOOGLE_MAPS_API_KEY}`

      const locationInfo = imageSource.type === 'streetView'
        ? await getLocationInfo(
            imageSource.params.lat,
            imageSource.params.lng
          )
        : null

      const locationContext = locationInfo?.address ? [
        locationInfo.address.street && `Located on ${locationInfo.address.street}`,
        locationInfo.address.neighborhood && `in the ${locationInfo.address.neighborhood} neighborhood`,
        locationInfo.address.city && 
          (locationInfo.address.city.toLowerCase().includes('new york') 
            ? locationInfo.address.neighborhood 
            : `in ${locationInfo.address.city}`),
      ].filter(Boolean).join(' ') : ''

      const agent = createAIAgent('openai', c)
      const result = await agent.analyzeImage({
        imageUrl,
        locationContext,
        userContext: context,
      })

      if (!result.isOutdoorSpace) {
        socket.emit('imageAnalysis', {
          projectId: projectId || 'temp',
          analysis: {
            isOutdoorSpace: false,
            description: result.analysis,
            analysis: result.analysis,
            suggestions: []
          }
        })
        return
      }

      // Generate images for suggestions
      const suggestions = await Promise.all(
        result.suggestions?.map(async (suggestion) => {
          try {
            const imageResponse = await agent.generateImage({
              prompt: suggestion.imagePrompt,
              originalImage: imageUrl
            })

            return {
              ...suggestion,
              generatedImageUrl: imageResponse.url
            }
          } catch (error) {
            logger.error('Failed to generate image for suggestion:', error)
            return suggestion
          }
        }) ?? []
      )

      // Store image analysis if associated with a project
      if (projectId) {
        const { db } = ctx
        await db.insert(projectImages).values({
          id: generateId(),
          project_id: projectId,
          type: 'current',
          image_url: imageUrl,
          ai_analysis: { 
            analysis: result.analysis,
            streetViewParams: imageSource.type === 'streetView' ? imageSource.params : undefined,
            suggestions
          },
          metadata: { 
            context: locationContext,
            userContext: context
          }
        })

        // Emit to project room
        io.to(`project:${projectId}`).emit('imageAnalysis', {
          projectId,
          analysis: {
            ...result,
            suggestions
          }
        })
      } else {
        // Emit only to requesting client
        socket.emit('imageAnalysis', {
          projectId: 'temp',
          analysis: {
            ...result,
            suggestions
          }
        })
      }
    } catch (error) {
      logger.error('Error in analyzeImage:', error)
      socket.emit('imageAnalysis', {
        projectId: projectId || 'temp',
        analysis: {
          isOutdoorSpace: false,
          description: error instanceof Error ? error.message : 'Failed to analyze image',
          analysis: 'Failed to analyze image',
          suggestions: []
        }
      })
    }
  })

  // Image Validation Handler
  socket.on('validateImage', async ({ requestId, imageSource, projectId, fundraiserId }) => {
    logger.info(`[validateImage:${requestId}] Starting validation request`)

    const validationKey = `validateImage:${requestId}`
    const validationResult = await ctx.redis.get(validationKey)
    if (validationResult) return;

    try {
      const { GOOGLE_AI_API_KEY, GOOGLE_MAPS_API_KEY } = env<Env>(c)
      
      if (!GOOGLE_AI_API_KEY || !GOOGLE_MAPS_API_KEY) {
        throw new Error('Missing required API configuration')
      }

      const imageUrl = imageSource.type === 'url' 
        ? imageSource.url 
        : `https://maps.googleapis.com/maps/api/streetview?size=600x400&location=${imageSource.params.lat},${imageSource.params.lng}&heading=${imageSource.params.heading}&pitch=${imageSource.params.pitch}&fov=${90/imageSource.params.zoom}&key=${GOOGLE_MAPS_API_KEY}`

      const agent = createAIAgent('openai', c)
      const validationResult = await agent.validateImage({ imageUrl })

      if (projectId) {

        if (validationResult.isMaybe || validationResult.isValid) {
          const { db } = ctx

          const existingImage = await db
            .select()
            .from(projectImages)
            .where(eq(projectImages.id, requestId))
            .limit(1)
          if (existingImage[0]) {
            await db.update(projectImages).set({
              ai_analysis: {
                description: validationResult.description,
              }
            }).where(eq(projectImages.id, requestId))
          } else {
            await db.insert(projectImages).values({
                id: requestId,
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
          }
        }

        // Emit to project room
        socket.emit('imageValidation', {
          projectId,
          requestId,
          result: {
            ...validationResult,
            error: validationResult.error ? {
              code: 'VALIDATION_ERROR',
              message: validationResult.error,
              details: new Error(validationResult.error)
            } : undefined
          }
        })

        const socketId = getSocketId(socket)
        notifyProjectSubscribers(projectId, socketId, io)
      } else {
        // Emit only to requesting client
        socket.emit('imageValidation', {
          projectId: 'temp',
          requestId,
          result: {
            ...validationResult,
            error: validationResult.error ? {
              code: 'VALIDATION_ERROR',
              message: validationResult.error,
              details: new Error(validationResult.error)
            } : undefined
          }
        })
      }
    } catch (error) {
      logger.error(`[validateImage:${requestId}] Error:`, error)
      socket.emit('imageValidation', {
        projectId: 'temp',
        requestId,
        result: {
          isValid: false,
          isMaybe: false,
          description: error instanceof Error ? error.message : 'Failed to validate image',
          error: {
            code: 'VALIDATION_ERROR',
            message: error instanceof Error ? error.message : 'Failed to validate image',
            details: new Error(error instanceof Error ? error.message : 'Failed to validate image')
          }
        }
      })
    } finally {
      ctx.redis.del(validationKey)
    }
  })

  // Project Vision Generation Handler
  socket.on('generateProjectVision', async ({ requestId, projectId, currentImageSource, desiredChanges }) => {
    logger.info(`Generating project vision for: ${projectId}`)
    try {
      const { db } = ctx
      const { GOOGLE_MAPS_API_KEY } = env<Env>(c)

      const initialImage = await db
        .select()
        .from(projectImages)
        .where(eq(projectImages.project_id, projectId))
        .orderBy(desc(projectImages.created_at))
        .limit(1)

      if (!initialImage[0]) {
        throw new Error('No validated image found for this project')
      }

      const imageUrl = currentImageSource.type === 'url' 
        ? currentImageSource.url
        : `https://maps.googleapis.com/maps/api/streetview?size=600x400&location=${currentImageSource.params.lat},${currentImageSource.params.lng}&heading=${currentImageSource.params.heading}&pitch=${currentImageSource.params.pitch}&fov=${90/currentImageSource.params.zoom}&key=${GOOGLE_MAPS_API_KEY}`

      const agent = createAIAgent('openai', c)
      const result = await agent.generateVision({
        imageUrl,
        desiredChanges,
        initialDescription: (initialImage[0].ai_analysis as { description: string }).description
      })

      // Store the vision
      await db.insert(projectImages).values({
        id: generateId(),
        project_id: projectId,
        type: 'vision',
        image_url: imageUrl,
        ai_generated_url: result.vision.imageUrl || null,
        ai_analysis: {
          description: result.vision.description,
          existingElements: result.vision.existingElements,
          newElements: result.vision.newElements,
          community_benefits: result.vision.communityBenefits,
          maintenance_considerations: result.vision.maintenanceConsiderations,
          image_prompt: result.vision.imagePrompt,
          desired_changes: desiredChanges,
          street_view_params: currentImageSource.type === 'streetView' ? currentImageSource.params : undefined
        }
      })

      // Emit to project room
      io.to(`project:${projectId}`).emit('projectVision', {
        projectId,
        requestId,
        vision: result.vision
      })
    } catch (error) {
      logger.error('Error generating project vision:', error)
      socket.emit('projectVision', {
        projectId: 'temp',
        requestId,
        vision: {
          code: 'VISION_ERROR',
          message: 'Failed to generate project vision',
          details: error
        }
      })
    }
  })

  // Cost Estimate Generation Handler
  socket.on('generateCostEstimate', async ({ requestId, projectId, description, category, scope }) => {
    logger.info(`Generating cost estimate for project: ${projectId}`)
    try {
      const { db } = ctx
      const agent = createAIAgent('openai', c)
      const result = await agent.generateEstimate({
        description,
        category,
        scope
      })

      // Store the estimate
      await db.insert(costEstimates).values({
        id: generateId(),
        project_id: projectId,
        version: '1',
        total_estimate: result.estimate.totalEstimate.toString(),
        breakdown: result.estimate.breakdown,
        assumptions: result.estimate.assumptions,
        confidence_scores: { overall: result.estimate.confidenceScore }
      })

      // Emit to project room
      io.to(`project:${projectId}`).emit('costEstimate', {
        projectId,
        requestId,
        estimate: result.estimate
      })
    } catch (error) {
      logger.error('Error generating cost estimate:', error)
      socket.emit('costEstimate', {
        projectId: 'temp',
        requestId,
        estimate: {
          code: 'ESTIMATE_ERROR',
          message: 'Failed to generate cost estimate',
          details: error
        }
      })
    }
  })

  // Project Subscription Handler
  socket.on('subscribeToProject', async ({ projectId, shouldSubscribe }) => {
    if (shouldSubscribe) {
      logger.info(`Client subscribing to project: ${projectId}`)
      await socket.join(`project:${projectId}`)
    } else {
      logger.info(`Client unsubscribing from project: ${projectId}`)
      await socket.leave(`project:${projectId}`)
    }
  })
} 