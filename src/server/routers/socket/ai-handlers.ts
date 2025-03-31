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
import { eq, desc, and } from "drizzle-orm";
import { getTreeHelpers } from "../tree-helpers/context";
import type { ProjectCategory, ProjectStatus, ProjectSuggestion } from "../../types/shared";
import { ImageGenerationAgent } from "../ai-helpers/leonardo-agent";
import { calculateProjectCosts, convertFlatToNestedCostBreakdown } from "@/lib/cost";
import { DedupeThing } from "@/lib/promise";
import { ParkbeatLogger } from "@/lib/logger";
import { AISocket, AIIO, clientEventsSchema, serverEventsSchema } from "./types";
import ngeohash from 'ngeohash';
import sizeOf from 'image-size';

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
  updateAndReimagineSuggestion: z.object({
    projectId: z.string(),
    suggestionId: z.string(),
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

export const aiEvents = {
  client: z.object(aiClientEvents),
  server: z.object(aiServerEvents)
}

type ProcedureContext = Parameters<Parameters<typeof publicProcedure.ws>[0]>[0]['ctx']
type ProcedureEnv = ContextWithSuperJSON<JStackEnv>
type LocalProcedure = Procedure<JStackEnv, ProcedureContext, void, typeof clientEventsSchema, typeof serverEventsSchema>
type ProcedureIO = Parameters<Parameters<LocalProcedure["ws"]>[0]>[0]['io']

export const setupAIHandlers = (socket: AISocket, ctx: ProcedureContext, io: ProcedureIO, c: ProcedureEnv, logger: Logger) => {
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
      projectId,
      suggestion
    })

    // Helper function to update suggestion images and notify subscribers
    const updateSuggestionImages = async (images: ProjectSuggestion['images']) => {
      await db.update(projectSuggestions)
        .set({ images })
        .where(eq(projectSuggestions.id, suggestion.id))
      notifyProjectSubscribers(projectId, socketId, io)
    }

    // Create a unique lock key for this suggestion's image generation
    const lockKey = `suggestion:${suggestion.id}:imageGeneration:lock`
    const lockTtl = 300 // 5 minutes in seconds
    
    // Try to acquire the lock using Redis SET NX with expiry
    const lock = await ctx.redis.set(lockKey, socketId, {
      nx: true,
      ex: lockTtl
    })
    
    if (!lock) {
      logger.info(`[generateImagesForSuggestion] Skipping - lock exists for suggestion ${suggestion.id}`)
      return
    }

    try {
      // Additional deduplication check using suggestion ID and source image
      const dedupeKey = `${suggestion.id}:${sourceImage.id}`
      const shouldProceed = await DedupeThing.getInstance().dedupe(
        'generateImagesForSuggestion',
        socketId,
        dedupeKey,
        projectId
      )
      if (!shouldProceed) {
        logger.info(`[generateImagesForSuggestion] Skipping - already processed with ID: ${suggestion.id}`)
        return
      }

      // Step 1: Initialize status
      await updateSuggestionImages({
        ...suggestion.images,
        source: {
          url: sourceImage.image_url,
          id: sourceImage.id
        },
        upscaled: {},
        status: {
          isUpscaling: true,
          isGenerating: false,
          lastError: null
        }
      })

      // Step 2: Prepare both upscaling and cost estimation in parallel
      let upscaledImageUrl = sourceImage.image_url
      let upscaleId: string | undefined

      /** Determine if upscaling the source image is required */
      const minimumUpscaleSize = 1024
      
      // Check if upscaling is needed by fetching image dimensions
      const needsUpscaling = await (async () => {
        try {
          // If we already have an upscaled version, we don't need to recheck
          if (suggestion.images?.upscaled?.url && suggestion.images?.upscaled?.id) {
            return false;
          }
          
          // Using image-size to check dimensions
          try {
            // Fetch the image as a buffer first
            const response = await fetch(sourceImage.image_url);
            if (!response.ok) {
              logger.warn(`[generateImagesForSuggestion] Failed to fetch image: ${response.status} ${response.statusText}`);
              return true; // Default to upscaling if fetch fails
            }
            
            const buffer = await response.arrayBuffer();
            const dimensions = sizeOf(Buffer.from(buffer));
            
            if (!dimensions || !dimensions.width || !dimensions.height) {
              logger.warn(`[generateImagesForSuggestion] Failed to determine image dimensions, assuming upscaling is needed`);
              return true;
            }
            
            // Check if either width or height is below the minimum size
            const needsUpscale = dimensions.width < minimumUpscaleSize || dimensions.height < minimumUpscaleSize;
            logger.info(`[generateImagesForSuggestion] Image size check: ${dimensions.width}x${dimensions.height}, needs upscaling: ${needsUpscale}`);
            return needsUpscale;
          } catch (sizeError) {
            logger.error(`[generateImagesForSuggestion] Error determining image size:`, {
              error: sizeError,
              sourceImageId: sourceImage.id
            });
            return true; // Default to upscaling if there's an error
          }
        } catch (error) {
          logger.error(`[generateImagesForSuggestion] Error checking image dimensions:`, {
            error,
            sourceImageId: sourceImage.id
          });
          // Default to upscaling if there's an error
          return true;
        }
      })();

      const [upscaleResult, costs] = await Promise.all([
        // Handle upscaling
        (async () => {
          try {
            // Check if we already have an upscaled version
            if (suggestion.images?.upscaled?.url && suggestion.images?.upscaled?.id) {
              logger.info(`[generateImagesForSuggestion] Using existing upscaled image for suggestion ${suggestion.id}`, {
                upscaleId: suggestion.images.upscaled.id,
                upscaledUrl: suggestion.images.upscaled.url
              })
              return {
                url: suggestion.images.upscaled.url,
                id: suggestion.images.upscaled.id
              }
            }

            // Skip upscaling if not needed
            if (!needsUpscaling) {
              logger.info(`[generateImagesForSuggestion] Skipping upscaling for image - dimensions meet minimum requirements`);
              return {
                url: sourceImage.image_url,
                id: sourceImage.id
              };
            }

            // Perform upscaling
            const upscaledImage = await leonardoAgent.upscaleImage({
              imageUrl: sourceImage.image_url,
              upscaleMultiplier: 1.5,
              style: 'REALISTIC'
            })

            return upscaledImage
          } catch (error) {
            logger.error(`[generateImagesForSuggestion] Error upscaling image ${sourceImage.id}:`, {
              error,
              sourceImageId: sourceImage.id,
              suggestionId: suggestion.id
            })
            return null
          }
        })(),
        // Calculate costs
        calculateProjectCosts(suggestion.estimatedCost?.breakdown)
      ])

      // Step 3: Update status after parallel operations
      if (upscaleResult) {
        upscaledImageUrl = upscaleResult.url
        upscaleId = upscaleResult.id

        await updateSuggestionImages({
          ...suggestion.images,
          source: {
            url: sourceImage.image_url,
            id: sourceImage.id
          },
          upscaled: {
            url: upscaleResult.url,
            id: upscaleResult.id,
            upscaledAt: new Date().toISOString()
          },
          status: {
            isUpscaling: false,
            isGenerating: true,
            lastError: null
          }
        })
      } else {
        // Continue with original image if upscaling fails
        logger.info(`[generateImagesForSuggestion] Continuing with original image after upscale failure`)
        await updateSuggestionImages({
          ...suggestion.images,
          source: {
            url: sourceImage.image_url,
            id: sourceImage.id
          },
          upscaled: {
            error: {
              code: 'UPSCALE_ERROR',
              message: 'Failed to upscale image'
            }
          },
          status: {
            isUpscaling: false,
            isGenerating: true,
            lastError: {
              code: 'UPSCALE_ERROR',
              message: 'Failed to upscale image',
              timestamp: new Date().toISOString()
            }
          }
        })
      }

      // Step 4: Prepare project context with cost information
      const costBreakdown = suggestion.estimatedCost?.breakdown
      
      logger.info('[generateImagesForSuggestion] Cost data:', {
        hasCosts: !!costs,
        hasCostBreakdown: !!costBreakdown,
        totalCost: costs?.total,
        breakdownStructure: costBreakdown
      })

      const projectDetails = costBreakdown ? `
Project Budget Breakdown:
Materials (Total: $${costs?.materials.total.toLocaleString() || 0}):
${costBreakdown.materials.items?.map(item => `- ${item.item}: $${item.cost.toLocaleString()}`).join('\n')}

Labor Requirements (Total: $${costs?.labor.total.toLocaleString() || 0}):
${costBreakdown.labor.items?.map(task => `- ${task.task || task.description}: ${task.hours} hours at $${task.rate}/hr`).join('\n')}

Additional Costs (Total: $${costs?.other.total.toLocaleString() || 0}):
${costBreakdown.other.items?.map(item => `- ${item.item}: $${item.cost}`).join('\n')}

Total Project Budget: $${costs?.total.toLocaleString() || 0}`.trim() : ''

      const projectContext = `
Project Title: "${suggestion.title}"
Project Description: ${suggestion.description || suggestion.summary}

${projectDetails}

Implementation Requirements:
1. Add all specified materials and elements from the materials list above
2. Ensure the scale of improvements matches the detailed budget
3. Show realistic construction quality matching the labor specifications
4. Include all key materials mentioned in the breakdown
5. Maintain proportions that reflect the cost allocation

Note: This is a ${suggestion.category.replace(/_/g, ' ')} project with a 
focus on community improvement and sustainable development.`.trim()

      logger.debug('[generateImagesForSuggestion] Project context:', {
        contextLength: projectContext.length,
        hasTitle: !!suggestion.title,
        hasDescription: !!(suggestion.description || suggestion.summary),
        hasDetails: !!projectDetails,
        context: projectContext
      })

      // Step 5: Generate the image
      const imageResult = await leonardoAgent.reimagineFromPrompt({
        originalImageUrl: upscaledImageUrl,
        prompt: suggestion.imagePrompt,
        projectContext
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
    } finally {
      // Always release the lock when done
      await ctx.redis.del(lockKey)
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

      const agent = createAIAgent('gemini', c)

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
          logger.info(`[generateSuggestionsForProject] No suggestions generated`, {
            result
          })
          throw new Error('No suggestions generated')
        }

        // Save new suggestions to database
        const metadata = images[0]?.metadata as { fundraiserId?: string } | null

        // Save suggestions first without cost estimates
        const savedSuggestions: ProjectSuggestion[] = await Promise.all(result.suggestions.map(async suggestion => {
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
            is_estimating: false,
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
        const suggestionsWithCosts: ProjectSuggestion[] = await Promise.all(savedSuggestions.map(async suggestion => {
          try {
            // Set the is_estimating flag to true before starting
            await db.update(projectSuggestions)
              .set({
                is_estimating: true
              })
              .where(eq(projectSuggestions.id, suggestion.id))
            
            const costEstimate = await agent.generateEstimate({
              description: suggestion.summary || suggestion.description || '',
              category: suggestion.category,
              scope: {
                size: 100, // Default size in square meters
                complexity: 'low',
                timeline: 3 // Default timeline in months
              }
            })

            // Update the suggestion with the cost estimate and set is_estimating to false
            await db.update(projectSuggestions)
              .set({
                estimated_cost: {
                  total: costEstimate.estimate.totalEstimate,
                  breakdown: costEstimate.estimate.breakdown,
                  assumptions: costEstimate.estimate.assumptions
                },
                is_estimating: false
              })
              .where(eq(projectSuggestions.id, suggestion.id))

            if (!costEstimate.estimate?.breakdown) {
              logger.error(`[generateSuggestionsForProject] No cost estimate generated for suggestion ${suggestion.id}`)
              return { ...suggestion, is_estimating: false }
            }

            logger.info(`[generateSuggestionsForProject] Generated cost estimate for suggestion: ${suggestion.id}`)
            return { 
              ...suggestion, 
              estimatedCost: {
                total: costEstimate.estimate.totalEstimate,
                breakdown: costEstimate.estimate.breakdown,
              },
              is_estimating: false
            }
          } catch (error) {
            // Make sure to set is_estimating to false even if there's an error
            await db.update(projectSuggestions)
              .set({
                is_estimating: false
              })
              .where(eq(projectSuggestions.id, suggestion.id))
              
            logger.error(`[generateSuggestionsForProject] Error generating cost estimate for suggestion ${suggestion.id}:`, error)
            return { ...suggestion, is_estimating: false }
          }
        }))

        notifyProjectSubscribers(projectId, socketId, io)
        // After saving suggestions, generate reimagined images using Leonardo
        logger.info(`[generateSuggestionsForProject] Starting image generation for ${savedSuggestions.length} suggestions`)
        
        const leonardoAgent = createAIImageAgent(c)
        
        // Generate images for all suggestions in parallel
        await Promise.all(suggestionsWithCosts.map(async (suggestion) => {
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

      const agent = createAIAgent('gemini', c)
      const validationResult = await agent.validateImage({ imageUrl })

      if (projectId) {
        if (validationResult.isMaybe || validationResult.isValid) {
          const { db } = ctx

          // Check if the project exists, and create it if it doesn't
          const existingProject = await db
            .select()
            .from(projects)
            .where(eq(projects.id, projectId))
            .limit(1)

          if (!existingProject.length) {
            // Create a draft project first
            const now = new Date()
            const defaultGeohash = imageSource.type === 'streetView' 
              ? ngeohash.encode(imageSource.params.lat, imageSource.params.lng, 9)
              : 'unknown'


            const projectData = {
              id: projectId,
              name: 'New Project',
              description: '',
              status: 'draft' as ProjectStatus,
              fundraiser_id: fundraiserId || projectId, // Use the project ID as a fallback fundraiser ID
              _loc_lat: imageSource.type === 'streetView' ? imageSource.params.lat.toString() : '0',
              _loc_lng: imageSource.type === 'streetView' ? imageSource.params.lng.toString() : '0',
              _loc_geohash: defaultGeohash,
              _meta_created_by: 'system',
              _meta_updated_by: 'system',
              _meta_updated_at: now,
              _meta_created_at: now,
              _view_heading: imageSource.type === 'streetView' ? imageSource.params.heading.toString() : null,
              _view_pitch: imageSource.type === 'streetView' ? imageSource.params.pitch.toString() : null,
              _view_zoom: imageSource.type === 'streetView' ? imageSource.params.zoom.toString() : null,
              source_suggestion_id: null,
              cost_breakdown: {
                materials: [],
                labor: [],
                other: []
              },
              category: 'other' as ProjectCategory, 
              summary: '',
              skill_requirements: '',
              space_assessment: {
                size: null,
                access: null,
                complexity: null, 
                constraints: []
              }
            };


            const [newProject] = await db
              .insert(projects)
              .values(projectData)
              .returning();
            if (!newProject) throw new Error('Failed to insert project');
            logger.info(`[validateImage:${requestId}] Created new draft project: ${projectId}`)
          }

          // Now insert or update the image
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
      const suggestionsToProcess: ProjectSuggestion[] = suggestions
        .filter(s => {
          // Skip if IDs were provided and this suggestion is not in the list
          if (suggestionIds && suggestionIds.length > 0 && !suggestionIds.includes(s.id)) {
            return false;
          }
          
          // Skip suggestions that are currently estimating costs
          if (s.is_estimating) {
            logger.info(`[generateImagesForSuggestions] Skipping suggestion ${s.id} because it's currently estimating costs`)
            return false;
          }
          
          // Only process suggestions that aren't already being processed
          const isProcessing = s.images?.status?.isGenerating || s.images?.status?.isUpscaling;
          const hasImages = (s.images?.generated?.length || 0) > 0;
          
          return !isProcessing && !hasImages;
        })
        .map(s => ({
          ...s,
          reasoning_context: s.reasoning_context || '',
          project_id: s.project_id || undefined,
          confidence: s.confidence,
          created_at: s.created_at.toISOString(),
          description: s.description || '',
          summary: s.summary || '',
          images: s.images as ProjectSuggestion['images'],
          metadata: s.metadata as ProjectSuggestion['metadata'],
          is_estimating: s.is_estimating || false // Ensure is_estimating is always defined
        }))

      // If we found suggestions that need image generation and have cost estimates
      if (suggestionsToProcess.length > 0) {
        logger.info(`[generateImagesForSuggestions] Processing ${suggestionsToProcess.length} suggestions with cost estimates`)
        
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
              suggestion,
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
      } else {
        logger.info(`[generateImagesForSuggestions] No suggestions found that need image generation or all are still estimating costs`)
      }
    } catch (error) {
      logger.error(`[generateImagesForSuggestions] Error:`, error)
    }
  })

  // New socket event handler to update a suggestion and regenerate its image
  socket.on('updateAndReimagineSuggestion', async ({ projectId, suggestionId }) => {
    const socketId = getSocketId(socket)
    const deduped = await DedupeThing.getInstance()
      .dedupe(socketId, 'updateAndReimagineSuggestion', projectId, suggestionId)
    if (!deduped) return;

    logger.info(`[updateAndReimagineSuggestion] Updating and regenerating image for suggestion: ${suggestionId} in project: ${projectId}`)

    try {
      const { db } = ctx
      const { LEONARDO_API_KEY } = env<Env>(c)
      
      if (!LEONARDO_API_KEY) {
        throw new Error('Missing LEONARDO_API_KEY')
      }

      // 1. Get the project data
      const project = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1)

      if (!project.length || !project[0]) {
        throw new Error('Project not found')
      }

      // 2. Get the suggestion to update
      const suggestionResult = await db
        .select()
        .from(projectSuggestions)
        .where(and(
          eq(projectSuggestions.id, suggestionId),
          eq(projectSuggestions.project_id, projectId)
        ))
        .limit(1)

      if (!suggestionResult.length || !suggestionResult[0]) {
        throw new Error('Suggestion not found')
      }

      const suggestion = suggestionResult[0]
      const projectData = project[0]

      const newBreakdown = convertFlatToNestedCostBreakdown(projectData.cost_breakdown);
      const newSuggestion = {
        title: projectData.name,
        description: projectData.description || suggestion.description || '',
        estimated_cost: {
          breakdown: newBreakdown,
          total: newBreakdown.total,
        },
        images: {
          ...(suggestion.images || {}),
          status: {
            isGenerating: true,
            isUpscaling: false,
            lastError: null
          },
          // Clear existing generated images to force regeneration
          generated: [],
          // Ensure source and upscaled objects exist
          source: suggestion.images?.source || { url: '', id: '' },
          upscaled: suggestion.images?.upscaled || {}
        }
      };

      console.info(`[updateAndReimagineSuggestion] New suggestion: ${JSON.stringify(newSuggestion, null, 2)}`)

      // 3. Update the suggestion with project values
      await db.update(projectSuggestions)
        .set(newSuggestion)
        .where(eq(projectSuggestions.id, suggestionId))

      // Notify project subscribers of changes
      notifyProjectSubscribers(projectId, socketId, io)

      // 4. Get the updated suggestion (to ensure we have the right data structure)
      const updatedSuggestionResult = await db
        .select()
        .from(projectSuggestions)
        .where(eq(projectSuggestions.id, suggestionId))
        .limit(1)

      console.info(`[updateAndReimagineSuggestion] Updated suggestion: ${JSON.stringify(updatedSuggestionResult, null, 2)}`)

      if (!updatedSuggestionResult.length || !updatedSuggestionResult[0]) {
        throw new Error('Failed to retrieve updated suggestion')
      }

      // 5. Get all images for the project
      const images = await db
        .select()
        .from(projectImages)
        .where(eq(projectImages.project_id, projectId))
        .orderBy(desc(projectImages.created_at))

      if (!images.length) {
        throw new Error('No images found for project')
      }

      // 6. Format the suggestion for image generation
      const updatedSuggestion = updatedSuggestionResult[0]
      
      // Ensure we have valid images property
      if (!updatedSuggestion.images) {
        updatedSuggestion.images = {
          status: {
            isUpscaling: false,
            isGenerating: false,
            lastError: null
          },
          source: { url: '', id: '' },
          upscaled: {},
          generated: []
        }
      }
      
      const suggestionToProcess = {
        ...updatedSuggestion,
        reasoning_context: updatedSuggestion.reasoning_context || '',
        created_at: typeof updatedSuggestion.created_at === 'string' 
          ? updatedSuggestion.created_at 
          : updatedSuggestion.created_at.toISOString(),
        description: updatedSuggestion.description || '',
        summary: updatedSuggestion.summary || null,
        metadata: updatedSuggestion.metadata as Record<string, unknown>,
        project_id: updatedSuggestion.project_id || projectId,
        is_estimating: false
      } as ProjectSuggestion

      // 7. Generate new images for the suggestion
      const leonardoAgent = createAIImageAgent(c)
      
      // Get a random image from the available images
      const randomIndex = Math.floor(Math.random() * images.length)
      const sourceImage = images[randomIndex]
      
      if (!sourceImage) {
        throw new Error('No source image found for project')
      }

      // 8. Generate images for the suggestion
      await generateImagesForSuggestion({
        suggestion: suggestionToProcess,
        sourceImage,
        leonardoAgent,
        db,
        projectId,
        socketId,
        io,
        logger
      })

      logger.info(`[updateAndReimagineSuggestion] Successfully updated and regenerated image for suggestion: ${suggestionId}`)
      
      // Notify project subscribers of changes
      notifyProjectSubscribers(projectId, socketId, io)
    } catch (error) {
      logger.error(`[updateAndReimagineSuggestion] Error:`, error)
      
      // If there was an error, try to reset the suggestion status
      try {
        const { db } = ctx
        const suggestionResult = await db
          .select()
          .from(projectSuggestions)
          .where(eq(projectSuggestions.id, suggestionId))
          .limit(1)
          
        if (suggestionResult.length && suggestionResult[0]) {
          const suggestion = suggestionResult[0]
          
          // Ensure suggestion has the required structure
          const updatedImages = {
            ...(suggestion.images || {}),
            status: {
              isGenerating: false,
              isUpscaling: false,
              lastError: {
                code: 'ERROR',
                message: error instanceof Error ? error.message : 'Unknown error',
                timestamp: new Date().toISOString()
              }
            },
            // Ensure these exist
            source: suggestion.images?.source || { url: '', id: '' },
            upscaled: suggestion.images?.upscaled || {},
            generated: suggestion.images?.generated || []
          }
          
          await db.update(projectSuggestions)
            .set({
              images: updatedImages
            })
            .where(eq(projectSuggestions.id, suggestionId))
            
          // Notify project subscribers of the error
          notifyProjectSubscribers(projectId, socketId, io)
        }
      } catch (resetError) {
        logger.error(`[updateAndReimagineSuggestion] Error resetting suggestion status:`, resetError)
      }
    }
  })
}
