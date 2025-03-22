import { z } from "zod";
import { createAIAgent, createAIImageAgent, type AIAgent } from "../ai-helpers/aigent";
import { Env } from "../ai-helpers/types";
import { Env as JStackEnv } from "@/server/jstack";
import { generateId } from "@/lib/id";
import { costEstimates, projectImages, projectSuggestions, projects } from "@/server/db/schema";
import { getLocationInfo } from "@/lib/location";
import { env } from "hono/adapter";
import type { publicProcedure } from "@/server/jstack";
import { ContextWithSuperJSON, Procedure } from "jstack";
import { eq, desc } from "drizzle-orm";
import { getTreeHelpers } from "../tree-helpers/context";
import type { ProjectCategory, ProjectSuggestion } from "../../types/shared";
import { ImageGenerationAgent } from "../ai-helpers/leonardo-agent";
import { calculateProjectCosts } from "@/lib/cost";
import { DedupeThing } from "@/lib/promise";
import { ParkbeatLogger } from "@/lib/logger";
import { AISocket, AIIO } from "./types";

type Logger = ParkbeatLogger.GroupLogger | ParkbeatLogger.Logger | typeof console

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
  validateImage: z.object({
    imageSource: imageSourceSchema,
    projectId: z.string(),
    fundraiserId: z.string(),
    requestId: z.string(),
  }),
  subscribeToProject: z.object({
    projectId: z.string(),
    shouldSubscribe: z.boolean(),
  }),
  generateImagesForSuggestions: z.object({
    projectId: z.string(),
    suggestionIds: z.array(z.string()).optional(),
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
        category: z.string(),
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
  })
};

const clientEvents = z.object(aiClientEvents)
const serverEvents = z.object(aiServerEvents)
type ProcedureContext = Parameters<Parameters<typeof publicProcedure.ws>[0]>[0]['ctx']
type ProcedureEnv = ContextWithSuperJSON<JStackEnv>

export const setupAIHandlers = (socket: AISocket, ctx: ProcedureContext, io: AIIO, c: ProcedureEnv, logger: Logger) => {
  const db = ctx.db;

  logger.info('Initializing AI WebSocket handler')
  const {
    notifyProjectSubscribers,
    getSocketId
  } = getTreeHelpers({ ctx, logger })

  // Helper function to generate images for suggestions
  const generateImagesForSuggestion = async ({
    suggestion,
    sourceImage,
    leonardoAgent,
    db,
    projectId,
    socketId,
    io,
    logger
  }: {
    suggestion: ProjectSuggestion
    sourceImage: { id: string; image_url: string }
    leonardoAgent: ImageGenerationAgent
    db: any
    projectId: string
    socketId: string
    io: AIIO
    logger: Logger
  }) => {
    logger.info(`[generateImagesForSuggestion] Starting process for suggestion ${suggestion.id}`, {
      suggestionTitle: suggestion.title,
      sourceImageId: sourceImage.id,
      projectId
    })

    // Helper function to update suggestion images and notify subscribers
    const updateSuggestionImages = async (images: ProjectSuggestion['images']) => {
      await db.update(projectSuggestions)
        .set({ images })
        .where(eq(projectSuggestions.id, suggestion.id))
      notifyProjectSubscribers(projectId, socketId, io)
    }

    try {
      let upscaledImageUrl = sourceImage.image_url
      let upscaleId: string | undefined
      
      // Check if we already have an upscaled version
      if (suggestion.images?.upscaled?.url && suggestion.images?.upscaled?.id) {
        logger.info(`[generateImagesForSuggestion] Using existing upscaled image for suggestion ${suggestion.id}`, {
          upscaleId: suggestion.images.upscaled.id,
          upscaledUrl: suggestion.images.upscaled.url
        })
        upscaledImageUrl = suggestion.images.upscaled.url
        upscaleId = suggestion.images.upscaled.id
      } else {
        // First upscale the source image
        try {
          // Initialize or update status
          await updateSuggestionImages({
            upscaled: {},
            ...suggestion.images,
            source: {
              url: sourceImage.image_url,
              id: sourceImage.id
            },
            status: {
              isUpscaling: true,
              isGenerating: false,
              lastError: null
            }
          })
    
          const upscaledImage = await leonardoAgent.upscaleImage({
            imageUrl: sourceImage.image_url,
            upscaleMultiplier: 1.5,
            style: 'REALISTIC'
          })

          upscaledImageUrl = upscaledImage.url
          upscaleId = upscaledImage.id

          await updateSuggestionImages({
            ...suggestion.images,
            source: {
              url: sourceImage.image_url,
              id: sourceImage.id
            },
            upscaled: {
              url: upscaledImage.url,
              id: upscaledImage.id,
              upscaledAt: new Date().toISOString()
            },
            status: {
              isUpscaling: false,
              isGenerating: false,
              lastError: null
            }
          })

        } catch (error) {
          logger.error(`[generateImagesForSuggestion] Error upscaling image ${sourceImage.id}:`, {
            error,
            sourceImageId: sourceImage.id,
            suggestionId: suggestion.id
          })

          await updateSuggestionImages({
            ...suggestion.images,
            source: {
              url: sourceImage.image_url,
              id: sourceImage.id
            },
            upscaled: {
              error: {
                code: 'UPSCALE_ERROR',
                message: error instanceof Error ? error.message : 'Failed to upscale image'
              }
            },
            status: {
              isUpscaling: false,
              isGenerating: false,
              lastError: {
                code: 'UPSCALE_ERROR',
                message: error instanceof Error ? error.message : 'Failed to upscale image',
                timestamp: new Date().toISOString()
              }
            }
          })

          // Continue with original image if upscaling fails
          logger.info(`[generateImagesForSuggestion] Continuing with original image after upscale failure`)
        }
      }

      // Update status for generation phase
      await updateSuggestionImages({
        ...suggestion.images,
        source: {
          url: sourceImage.image_url,
          id: sourceImage.id
        },
        upscaled: suggestion.images?.upscaled || {},
        status: {
          isUpscaling: false,
          isGenerating: true,
          lastError: null
        }
      })

      const costs = calculateProjectCosts(suggestion.estimatedCost?.breakdown)
      const projectDetails = costs ? `
        Project Budget Breakdown:
        - Materials (${costs.materials.total.toLocaleString()})
        - Labor Requirements: ${costs.labor.total.toLocaleString()}
        - Additional Costs: ${costs.other.total.toLocaleString()}
        Total Budget: $${costs.total.toLocaleString()}
      ` : ''

      const imageResult = await leonardoAgent.reimagineFromPrompt({
        originalImageUrl: upscaledImageUrl,
        prompt: suggestion.imagePrompt,
        projectContext: `
          Project Title: "${suggestion.title}"
          Project Description: ${suggestion.description || suggestion.summary}
          ${projectDetails}
          Implementation Requirements:
          1. Add all specified materials and elements from the materials list
          2. Ensure the scale of improvements matches the budget
          3. Show realistic construction quality matching the labor specifications
        `
      })

      if (imageResult.urls.length > 0) {
        const newGeneratedImage = {
          url: imageResult.urls[0] || '',
          generatedAt: new Date().toISOString(),
          generationId: imageResult.generationId
        }

        await updateSuggestionImages({
          source: {
            url: sourceImage.image_url,
            id: sourceImage.id
          },
          upscaled: {
            url: upscaledImageUrl,
            id: upscaleId,
            upscaledAt: suggestion.images?.upscaled?.upscaledAt || new Date().toISOString()
          },
          generated: [...(suggestion.images?.generated || []), newGeneratedImage],
          status: {
            isUpscaling: false,
            isGenerating: false,
            lastError: null
          }
        })

        return imageResult
      } else {
        await updateSuggestionImages({
          source: {},
          upscaled: {},
          ...suggestion.images,
          status: {
            isUpscaling: false,
            isGenerating: false,
            lastError: {
              code: 'GENERATION_ERROR',
              message: 'No images were generated',
              timestamp: new Date().toISOString()
            }
          }
        })
      }
    } catch (error) {
      logger.error(`[generateImagesForSuggestion] Error in image generation process`, {
        error,
        suggestionId: suggestion.id,
        projectId,
        sourceImageId: sourceImage.id
      })

      await updateSuggestionImages({
        source: {},
        upscaled: {},
        ...suggestion.images,
        status: {
          isUpscaling: false,
          isGenerating: false,
          lastError: {
            code: 'GENERATION_ERROR',
            message: error instanceof Error ? error.message : 'Failed to generate image',
            timestamp: new Date().toISOString()
          }
        }
      })

      throw error
    }
  }

  // Helper function to generate suggestions for a project
  const generateSuggestionsForProject = async (projectId: string) => {
    logger.info(`[generateSuggestionsForProject] Starting suggestion generation for project: ${projectId}`)
    const socketId = getSocketId(socket)
    
    try {
      const { GOOGLE_AI_API_KEY, GOOGLE_MAPS_API_KEY, MAPTILER_API_KEY, LEONARDO_API_KEY } = env<Env>(c)
      
      if (!GOOGLE_AI_API_KEY || !GOOGLE_MAPS_API_KEY || !LEONARDO_API_KEY) {
        throw new Error('Missing required API configuration')
      }

      // Get the current execution ID from Redis
      const executionKey = `project:suggestionGenerationExecution:${projectId}`
      const executionId = generateId()
      const currentExecution = await ctx.redis.get(executionKey)
      
      // If there's already an execution in progress, skip
      if (currentExecution) {
        logger.info(`[generateSuggestionsForProject] Skipping - already running with ID: ${currentExecution}`)
        return
      }

      // Set the new execution ID
      await ctx.redis.set(executionKey, executionId)

      // Get all validated images for the project
      const images = await db
        .select()
        .from(projectImages)
        .where(eq(projectImages.project_id, projectId))
        .orderBy(desc(projectImages.created_at))

      if (!images.length) {
        logger.info(`[generateSuggestionsForProject] No images found for project: ${projectId}`)
        await ctx.redis.del(executionKey)
        return
      }

      const agent = createAIAgent('openai', c)

      // Verify we're still the current execution
      const currentId = await ctx.redis.get(executionKey)
      if (currentId !== executionId) {
        logger.info(`[generateSuggestionsForProject] Execution ${executionId} was superseded by ${currentId}`)
        return
      }

      // Delete existing suggestions for this project before starting
      await db.delete(projectSuggestions)
        .where(eq(projectSuggestions.project_id, projectId))

      notifyProjectSubscribers(projectId, socketId, io)

      // Analyze all images together to generate consolidated suggestions
      try {
        const imageAnalyses = await Promise.all(images.map(image => ({
          imageUrl: image.image_url,
          locationContext: (image.metadata as { context: string })?.context,
          userContext: (image.metadata as { userContext: string })?.userContext
        })))

        const locationContext = imageAnalyses.find(({ locationContext }) => locationContext)?.locationContext
        logger.debug('[generateSuggestionsForProject] locationContext', locationContext)

        let finalLocationContext = locationContext
        if (!finalLocationContext) {
          // If no location context from images, get it from project coordinates
          const project = await db
            .select()
            .from(projects)
            .where(eq(projects.id, projectId))
            .limit(1)

          if (project[0]) {
            const key = MAPTILER_API_KEY
            const locationInfo = await getLocationInfo(Number(project[0]._loc_lat), Number(project[0]._loc_lng), key)
            logger.debug('[generateSuggestionsForProject] locationInfo', locationInfo)
            if (locationInfo.address) {
              finalLocationContext = [
                locationInfo.address.street || locationInfo.address.road && `Located on ${locationInfo.address.street || locationInfo.address.road}`,
                locationInfo.address.neighborhood || locationInfo.address.suburb && `in the ${locationInfo.address.neighborhood || locationInfo.address.suburb} neighborhood`,
                locationInfo.address.city && 
                  (locationInfo.address.city.toLowerCase().includes('new york') 
                    ? locationInfo.address.neighborhood || locationInfo.address.borough
                    : `in ${locationInfo.address.city}`),
              ].filter(Boolean).join(' ')
            }
          }
        }

        logger.debug('[generateSuggestionsForProject] finalLocationContext', finalLocationContext)

        const result = await agent.analyzeImages({
          images: imageAnalyses,
          locationContext: finalLocationContext,
          maxSuggestions: 3 
        })

        if (!result.suggestions?.length) {
          logger.info(`[generateSuggestionsForProject] No suggestions generated`)
          return
        }

        // Save new suggestions to database
        const metadata = images[0]?.metadata as { fundraiserId?: string } | null

        // Save suggestions first without cost estimates
        const savedSuggestions = await Promise.all(result.suggestions.map(async suggestion => {
          const suggestionId = generateId()
          const newSuggestion: ProjectSuggestion = {
            id: suggestionId,
            project_id: projectId,
            fundraiser_id: metadata?.fundraiserId || projectId,
            title: suggestion.title,
            description: suggestion.summary || '',
            summary: suggestion.summary,
            imagePrompt: suggestion.imagePrompt,
            category: suggestion.category as ProjectCategory,
            images: {
              generated: [],
              upscaled: {},
              source: {
                url: '',
                id: ''
              },
              status: {
                isUpscaling: false,
                isGenerating: false,
                lastError: null
              }
            },
            confidence: '0.8',
            reasoning_context: 'Generated from consolidated image analysis',
            status: 'pending',
            created_at: new Date().toISOString(),
            metadata: {
              generatedAt: new Date().toISOString(),
              sourceImageCount: images.length
            }
          }
          
          await db.insert(projectSuggestions).values({
            ...newSuggestion,
            description: newSuggestion.description || '',
            confidence: newSuggestion.confidence.toString(),
            status: newSuggestion.status,
            created_at: new Date()
          })
          return newSuggestion
        }))

        notifyProjectSubscribers(projectId, socketId, io)

        // Generate cost estimates for all suggestions in parallel
        await Promise.all(savedSuggestions.map(async suggestion => {
          try {
            const costEstimate = await agent.generateEstimate({
              description: suggestion.summary || suggestion.description || '',
              category: suggestion.category,
              scope: {
                size: 100, // Default size in square meters
                complexity: 'low',
                timeline: 3 // Default timeline in months
              }
            })

            // Update the suggestion with the cost estimate
            await db.update(projectSuggestions)
              .set({
                estimated_cost: {
                  total: costEstimate.estimate.totalEstimate,
                  breakdown: costEstimate.estimate.breakdown,
                  assumptions: costEstimate.estimate.assumptions
                }
              })
              .where(eq(projectSuggestions.id, suggestion.id))

            logger.info(`[generateSuggestionsForProject] Generated cost estimate for suggestion: ${suggestion.id}`)
          } catch (error) {
            logger.error(`[generateSuggestionsForProject] Error generating cost estimate for suggestion ${suggestion.id}:`, error)
          }
        }))

        notifyProjectSubscribers(projectId, socketId, io)
        // After saving suggestions, generate reimagined images using Leonardo
        logger.info(`[generateSuggestionsForProject] Starting image generation for ${savedSuggestions.length} suggestions`)
        
        const leonardoAgent = createAIImageAgent(c)
        
        // Generate images for all suggestions in parallel
        await Promise.all(savedSuggestions.map(async (suggestion) => {
          try {
            const randomIndex = Math.floor(Math.random() * images.length)
            const sourceImage = images[randomIndex]
            if (!sourceImage) {
              logger.warn(`[generateSuggestionsForProject] No source image found for suggestion ${suggestion.id}`)
              return
            }

            await generateImagesForSuggestion({
              suggestion,
              sourceImage,
              leonardoAgent,
              db: ctx.db,
              projectId,
              socketId,
              io,
              logger
            })

            notifyProjectSubscribers(projectId, socketId, io)
          } catch (error) {
            logger.error(`[generateSuggestionsForProject] Error processing suggestion ${suggestion.id}:`, error)
          }
        }))

        // Clear the execution ID
        await ctx.redis.del(executionKey)

        // Notify subscribers after all images are generated
        notifyProjectSubscribers(projectId, socketId, io)

        logger.info(`[generateSuggestionsForcProject] Successfully completed suggestion and image generation for project: ${projectId}`)
      } catch (error) {
        await ctx.redis.del(executionKey)
        logger.error(`[generateSuggestionsForProject] Error analyzing images:`, error)
        throw error
      }
    } catch (error) {
      logger.error(`[generateSuggestionsForProject] Error generating suggestions:`, error)
      throw error
    }
  }

  // Image Validation Handler
  socket.on('validateImage', async ({ requestId, imageSource, projectId, fundraiserId }) => {
    logger.info(`[validateImage:${requestId}] Starting validation request`)
    
    const socketId = getSocketId(socket)
    const deduped = await DedupeThing.getInstance()
      .dedupe(socketId, 'validateImage', requestId)
    if (!deduped) return;

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

          // Trigger suggestion generation after successful validation
          generateSuggestionsForProject(projectId).catch(error => {
            logger.error(`[validateImage] Error generating suggestions:`, error)
          })
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

  // Project Subscription Handler
  socket.on('subscribeToProject', async ({ projectId, shouldSubscribe }) => {
    const socketId = getSocketId(socket)
    const deduped = await DedupeThing.getInstance()
      .dedupe(socketId, 'subscribeToProject', projectId)
    if (!deduped) return;

    if (shouldSubscribe) {
      logger.info(`Client subscribing to project: ${projectId}`)
      await socket.join(`project:${projectId}`)
    } else {
      logger.info(`Client unsubscribing from project: ${projectId}`)
      await socket.leave(`project:${projectId}`)
    }
  })

  // Update the generateImagesForSuggestions handler to use the shared helper
  socket.on('generateImagesForSuggestions', async ({ projectId, suggestionIds }) => {
    const socketId = getSocketId(socket)
    const deduped = await DedupeThing.getInstance()
      .dedupe(socketId, 'generateImagesForSuggestions', projectId)
    if (!deduped) return;

    logger.info(`[generateImagesForSuggestions] Starting image generation for project: ${projectId}`, {
      suggestionIds: suggestionIds || 'all'
    })

    try {
      const { db } = ctx
      const { LEONARDO_API_KEY } = env<Env>(c)
      
      if (!LEONARDO_API_KEY) {
        throw new Error('Missing LEONARDO_API_KEY')
      }

      // Get all images for the project
      const images = await db
        .select()
        .from(projectImages)
        .where(eq(projectImages.project_id, projectId))
        .orderBy(desc(projectImages.created_at))

      if (!images.length) {
        throw new Error('No images found for project')
      }

      // Get suggestions to process
      const suggestions = await db
        .select()
        .from(projectSuggestions)
        .where(eq(projectSuggestions.project_id, projectId))
        .orderBy(desc(projectSuggestions.created_at))

      if (!suggestions.length) {
        throw new Error('No suggestions found for project')
      }

      // Filter suggestions if specific IDs were provided
      const suggestionsToProcess: ProjectSuggestion[] = (suggestionIds 
        ? suggestions.filter(s => suggestionIds.includes(s.id))
        : suggestions).map(s => ({
          ...s,
          reasoning_context: s.reasoning_context || '',
          project_id: s.project_id || undefined,
          confidence: s.confidence,
          created_at: s.created_at.toISOString(),
          description: s.description || '',
          summary: s.summary || '',
          images: s.images as ProjectSuggestion['images'],
          metadata: s.metadata as ProjectSuggestion['metadata']
        }))

      const leonardoAgent = createAIImageAgent(c)
      const socketId = getSocketId(socket)
      
      // Process each suggestion
      await Promise.all(suggestionsToProcess.map(async (suggestion) => {
        try {
          // Get a random image from the available images
          const randomIndex = Math.floor(Math.random() * images.length)
          const sourceImage = images[randomIndex]
          if (!sourceImage) {
            logger.warn(`[generateImagesForSuggestions] No source image found for suggestion ${suggestion.id}`)
            return
          }

          await generateImagesForSuggestion({
            suggestion: suggestion as ProjectSuggestion,
            sourceImage,
            leonardoAgent,
            db,
            projectId,
            socketId,
            io,
            logger
          })
        } catch (error) {
          logger.error(`[generateImagesForSuggestions] Error processing suggestion ${suggestion.id}:`, error)
        }
      }))

      logger.info(`[generateImagesForSuggestions] Completed image generation for project: ${projectId}`)
    } catch (error) {
      logger.error(`[generateImagesForSuggestions] Error:`, error)
    }
  })
} 