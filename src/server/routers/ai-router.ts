import { aiRecommendations, costEstimates, projectImages } from "@/server/db/schema"
import { desc, eq, and } from "drizzle-orm"
import { z } from "zod"
import { j, publicProcedure } from "../jstack"
import { generateId } from "@/lib/id"
import { GoogleGenerativeAI } from "@google/generative-ai"
import { env } from "hono/adapter"
import { Storage } from '@google-cloud/storage'
import { iterateLatLng } from "./tree-helpers/geo"
import { ImageSource } from "maplibre-gl"
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

// Cloudflare R2 types
interface R2Bucket {
  put(key: string, value: ArrayBuffer | ReadableStream, options?: {
    httpMetadata?: { contentType?: string };
    customMetadata?: Record<string, string>;
  }): Promise<R2Object>;
  get(key: string): Promise<R2Object | null>;
}

interface R2Object {
  key: string;
  version: string;
  size: number;
  etag: string;
  httpEtag: string;
  body: ReadableStream;
  writeHttpMetadata(headers: Headers): void;
  httpMetadata?: { contentType?: string };
  customMetadata?: Record<string, string>;
}

// Environment bindings type
interface Bindings {
  DATABASE_URL: string;
  UPSTASH_REDIS_REST_URL: string;
  UPSTASH_REDIS_REST_TOKEN: string;
  WEBSOCKET_DO: DurableObjectNamespace;
  R2_BUCKET: R2Bucket;
}

// Environment type
type Env = Record<string, string> & {
  GOOGLE_AI_API_KEY: string;
  GOOGLE_MAPS_API_KEY: string;
  GCP_PROJECT_ID: string;
  GCP_CLIENT_EMAIL: string;
  GCP_PRIVATE_KEY: string;
  R2_BUCKET_NAME: string;
}

// Initialize GCP Storage
const createStorageClient = (credentials: { projectId: string, clientEmail: string, privateKey: string }) => {
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
  context: z.string().optional(), // Additional context about the image or location
  fundraiserId: z.string(),
})

const projectVisionSchema = z.object({
  projectId: z.string(),
  currentImageSource: imageSourceSchema,
  desiredChanges: z.string(), // Description of desired changes
})

const costEstimateSchema = z.object({
  projectId: z.string(),
  description: z.string(),
  category: z.enum(PROJECT_CATEGORIES),
  scope: z.object({
    size: z.number(), // Area in square meters
    complexity: z.enum(['low', 'medium', 'high']),
    timeline: z.number(), // Estimated months
  }),
})

export const aiRouter = j.router({
  // Analyze an image and suggest potential projects
  analyzeImage: publicProcedure
    .input(imageAnalysisSchema)
    .post(async ({ c, ctx, input }) => {
      try {
        console.log('Starting analyzeImage with input:', input)
        const { db } = ctx
        const { imageSource, projectId, context, fundraiserId, id } = input
        const { GOOGLE_AI_API_KEY, GOOGLE_MAPS_API_KEY, R2_BUCKET_NAME } = env<Env>(c)
        
        if (!GOOGLE_AI_API_KEY || !GOOGLE_MAPS_API_KEY) {
          console.error('Missing required API keys:', { 
            hasGoogleAI: !!GOOGLE_AI_API_KEY, 
            hasGoogleMaps: !!GOOGLE_MAPS_API_KEY 
          })
          return c.json({ error: 'Missing required API configuration' }, 500)
        }

        const r2 = (c.env as unknown as Bindings).R2_BUCKET
        if (!r2) {
          console.error('R2 bucket not configured')
          return c.json({ error: 'Storage configuration error: R2 bucket not found in bindings' }, 500)
        }

        // Verify R2 bucket has required methods
        if (typeof r2.put !== 'function') {
          console.error('R2 bucket missing put method')
          return c.json({ error: 'Storage configuration error: Invalid R2 bucket configuration' }, 500)
        }

        try {
          // Get image URL based on source type
          const imageUrl = imageSource.type === 'url' 
            ? imageSource.url 
            : `https://maps.googleapis.com/maps/api/streetview?size=600x400&location=${imageSource.params.lat},${imageSource.params.lng}&heading=${imageSource.params.heading}&pitch=${imageSource.params.pitch}&fov=${90/imageSource.params.zoom}&key=${GOOGLE_MAPS_API_KEY}`

          console.log('Generated image URL:', imageUrl)
          const imageResponse = await fetch(imageUrl)
          const imageBuffer = await imageResponse.arrayBuffer()
          console.log('Image buffer size:', imageBuffer.byteLength)

          // // Upload to R2 if it's a Street View image
          // let publicImageUrl = imageUrl
          // if (imageSource.type === 'streetView') {
          //   try {
          //     // Generate a unique filename
          //     const fileName = `street-view/${generateId()}-${imageSource.params.lat}-${imageSource.params.lng}.jpg`

          //     // Fetch the image
          //     console.log('Fetching Street View image...')
          //     const imageResponse = await fetch(imageUrl)
          //     if (!imageResponse.ok) {
          //       console.error('Failed to fetch Street View image:', {
          //         status: imageResponse.status,
          //         statusText: imageResponse.statusText
          //       })
          //       throw new Error(`Failed to fetch Street View image: ${imageResponse.statusText}`)
          //     }

          //     // Upload to R2
          //     console.log('Uploading to R2:', { fileName, bucketName: R2_BUCKET_NAME })
          //     const imageBuffer = await imageResponse.arrayBuffer()
          //     console.log('Image buffer size:', imageBuffer.byteLength)

          //     const result = await r2.put(fileName, imageBuffer, {
          //       httpMetadata: {
          //         contentType: 'image/jpeg',
          //       },
          //       customMetadata: {
          //         streetViewParams: JSON.stringify(imageSource.params),
          //         uploadedAt: new Date().toISOString(),
          //         fundraiserId,
          //       }
          //     })
          //     console.log('R2 upload completed:', result)

          //     // Get the public URL (using R2 public bucket URL)
          //     publicImageUrl = `https://${R2_BUCKET_NAME}.r2.dev/${fileName}`
          //     console.log('Generated public URL:', publicImageUrl)
          //   } catch (uploadError) {
          //     console.error('Error uploading to R2:', uploadError)
          //     return c.json({ 
          //       error: 'Failed to store image',
          //       details: uploadError instanceof Error ? uploadError.message : 'Unknown error'
          //     }, 500)
          //   }
          // }

          // Initialize Gemini Vision model
          const genAI = new GoogleGenerativeAI(GOOGLE_AI_API_KEY)
          const model = genAI.getGenerativeModel({
            model: 'gemini-1.5-pro',
            systemInstruction: `
    You are an integral part of parkbeat! The place where people can band
    together to improve their local parks and green spaces. Your job is to
    recommend ways to make that easier, showing us imaginings of what could be
    and expressing the cost of making those improvements. You are also 
    a financial expert, and can use your knowledge to recommend projects that are both
    realistic and financially feasible for a crowdfunded project.

    Try to keep your language friendly, conversational, and heartfelt. Use
    smaller words and lots of emojis to make it more engaging.

    It's very important that you keep your responses concise and to the point.
    I'll at times ask for a structured response, and you should always follow that request.
    Prioritize aesthetic appeal and frugality. Be down to earth and practical. 

    These are the categories of projects you can recommend:
    ${PROJECT_CATEGORIES.toSorted(() => Math.random() - 0.5).join(', ')}
          `
          })

          const isOutdoorSpace = await model.generateContent([
            `RESPONSE STRUCTURE: LINE ONE -- RESPOND WITH "YES" OR "NO". 
            IF NO, FOLLOWED BY LINE TWO -- EXPLAIN YOUR REASONING.`,
            imageUrl,
            `Is this image of an outdoor space and appropriate for use?`
          ])
          const isOutdoorSpaceResponse = isOutdoorSpace.response.text()

          if (isOutdoorSpaceResponse.includes('NO')) {
            return c.json({
              error: 'My intuition tells me this isn\'t an outdoor space... I could be wrong! Maybe try again?'
            })
          }

          const MAX_ITERATIONS = 4
          const getRequiresMoreContext = async (img: string, iterations: number) => {
            return model.generateContent([
              `RESPONSE STRUCTURE: LINE ONE -- RESPOND WITH "YES" OR "NO". 
              IF YES, FOLLOWED BY LINE TWO -- INDICATE TRAVERSAL INSTRUCTIONS 
              AS FOLLOWS: (dir: N | S | E | W, heading: number, pitch: number, zoom: number).`,
              img,
              `Do you require more context to analyze the space and the efficacy
              of your answer? If yes, indicate the cardinal direction you
              would like to see more of and the pitch and zoom you need to adjust to.
              If no, respond with "NO CONTEXT REQUIRED".`
              + (iterations > 1
                ? `You have used ${iterations}/${MAX_ITERATIONS} iterations of context.` : '')
            ])
          };

          const imgs = [imageUrl]
          let requireMoreContext = await getRequiresMoreContext(imageUrl, 0)

          let requireMoreContextResponse = requireMoreContext.response.text()
          let iterations = 0

          console.log('requireMoreContextResponse', requireMoreContextResponse)
          while (requireMoreContextResponse.includes('YES') && iterations <= MAX_ITERATIONS) {
            iterations++
            
            if (imageSource.type !== 'streetView') continue;
            const values = requireMoreContextResponse.trim()
              .replaceAll('YES', '')
              .replaceAll('(', '')
              .replaceAll(')', '')
              .replaceAll(' ', '')
              .split(',')

            const [directionStr, headingStr, pitchStr, zoomStr] = values

            const direction = directionStr?.split(':')[1]
            const heading = headingStr?.split(':')[1]
            const pitch = pitchStr?.split(':')[1]
            const zoom = zoomStr?.split(':')[1]

            console.log('iteration', iterations)
            console.log('requireMoreContextResponse', requireMoreContextResponse)
            console.log('next direction:', direction)
            console.log('next pitch:', pitch)
            console.log('next zoom:', zoom)

            if (!direction || !heading || !pitch || !zoom) continue;

            const newLatLng = iterateLatLng(
              imageSource.params.lat,
              imageSource.params.lng,
              direction,
              0.0001
            )

            const newUrl = `https://maps.googleapis.com/maps/api/streetview?size=600x400&location=${newLatLng.lat},${newLatLng.lng}&heading=${imageSource.params.heading}&pitch=${parseInt(pitch)}&fov=${90/parseInt(zoom)}&key=${GOOGLE_MAPS_API_KEY}`

            imageSource.params.lat = newLatLng.lat
            imageSource.params.lng = newLatLng.lng

            await Promise.all([
              async () => {
                imgs.push(newUrl)
                requireMoreContext = await getRequiresMoreContext(newUrl, iterations)
                requireMoreContextResponse = requireMoreContext.response.text()
              },
              async () => {
                const imageResponse = await fetch(newUrl)
                const imageBuffer = await imageResponse.arrayBuffer()
                console.log('Image buffer size:', imageBuffer.byteLength)
                const fileName = `sv/${generateId()}-${newLatLng.lat}-${newLatLng.lng}.jpg`
                const result = await r2.put(fileName, imageBuffer, {
                  httpMetadata: {
                    contentType: 'image/jpeg',
                  },
                  customMetadata: {
                    streetViewParams: JSON.stringify(imageSource.params),
                  } 
                })
                console.log('R2 upload completed:', result.httpMetadata)
              }
            ])
          }

          // Analyze image and generate recommendations
          const result = await model.generateContent([
            imageUrl,
            `Analyze this location image and suggest potential community improvement projects. 
            Prioritize landscape projects that are easy to maintain, and have a high aesthetic appeal.
            If a tree is present, possibly suggest a tree bed. 
            ${context || ''}

            RESPONSE STRUCTURE:
            1: CATEGORY
            2: FRIENDLY TITLE
            3: DESCRIPTION
            4: IMAGE GENERATION PROMPT FOR THE OUTCOME OF THE PROJECT. BE VERY SPECIFIC
              ABOUT WHAT YOU SEE IN THE INPUT IMAGE AND WHERE YOU THINK THE PROJECT
              SHOULD GO.
            5: ESTIMATED COST
                - Material  $approx_cost
                - Materials $approx_cost
                - Labor     $approx_cost
                - Total     $approx_cost
            6: REASONING CONTEXT
            `
          ])
          const response = await result.response
          const analysis = response.text()

          // Store image analysis if associated with a project
          if (projectId) {
            await db.insert(projectImages).values({
              id: generateId(),
              projectId,
              type: 'current',
              imageUrl,
              aiAnalysis: { 
                analysis,
                streetViewParams: imageSource.type === 'streetView' ? imageSource.params : undefined
              },
              metadata: { context }
            })
          }

          const existingRecommendationResult = await db
            .select()
            .from(aiRecommendations)
            .where(eq(aiRecommendations.fundraiserId, fundraiserId))
          const existingRecommendation = existingRecommendationResult?.[0]

          // Parse AI response and generate structured recommendations
          const recommendation = {
            id: id || generateId(),
            title: 'Project Recommendation',
            category: PROJECT_CATEGORIES[0],
            estimatedCost: { total: 0 },
            description: analysis,
            confidence: '0.8',
            suggestedLocation: imageSource.type === 'streetView' ? {
              lat: imageSource.params.lat,
              lng: imageSource.params.lng,
              heading: imageSource.params.heading,
              pitch: imageSource.params.pitch,
              zoom: imageSource.params.zoom,
            } : null,
            inspirationImages: [
              ...(Object.values(existingRecommendation?.inspirationImages ?? [])),
              imageUrl,
            ],
            reasoningContext: analysis,
            status: 'pending',
            fundraiserId,
          }

          // Store recommendation
          if (existingRecommendation) {
            await db.update(aiRecommendations)
              .set({
                ...recommendation,
                metadata: {
                  ...(existingRecommendation.metadata ?? {}),
                  updatedAt: new Date()
                }
              })
              .where(eq(aiRecommendations.id, existingRecommendation.id))
          } else {
            await db.insert(aiRecommendations).values(recommendation)
          }

          return c.json({
            analysis,
            recommendation,
            imageUrl
          })
        } catch (error) {
          console.error('Error in image analysis:', error)
          throw error
        }
      } catch (error) {
        console.error('Error in analyzeImage:', error)
        throw error
      }
    }),

  // Generate a vision of how a location could look after improvements
  generateProjectVision: publicProcedure
    .input(projectVisionSchema)
    .post(async ({ c, ctx, input }) => {
      const { db } = ctx
      const { projectId, currentImageSource, desiredChanges } = input
      const { GOOGLE_AI_API_KEY } = env<Env>(c)

      try {
        // Get image URL based on source type
        const currentImageUrl = currentImageSource.type === 'url'
          ? currentImageSource.url
          : `https://maps.googleapis.com/maps/api/streetview?size=600x400&location=${currentImageSource.params.lat},${currentImageSource.params.lng}&heading=${currentImageSource.params.heading}&pitch=${currentImageSource.params.pitch}&fov=${90/currentImageSource.params.zoom}&key=${GOOGLE_AI_API_KEY}`

        // Initialize Gemini Vision model
        const genAI = new GoogleGenerativeAI(GOOGLE_AI_API_KEY)
        const model = genAI.getGenerativeModel({ model: 'gemini-pro-vision' })

        // Generate vision description
        const result = await model.generateContent([
          currentImageUrl,
          `Given this current location image, describe in detail how it would look after these changes: ${desiredChanges}
           Focus on realistic, achievable improvements that maintain the location's character while enhancing its community value.
           Consider environmental impact, accessibility, and long-term sustainability.`
        ])
        const response = await result.response
        const visionDescription = response.text()

        // TODO: Integrate with an image generation service to create the visual
        const aiGeneratedUrl = null // Would come from image generation service

        // Store the vision
        await db.insert(projectImages).values({
          id: generateId(),
          projectId,
          type: 'vision',
          imageUrl: currentImageUrl,
          aiGeneratedUrl,
          aiAnalysis: {
            description: visionDescription,
            desiredChanges,
            streetViewParams: currentImageSource.type === 'streetView' ? currentImageSource.params : undefined
          }
        })

        return c.json({
          visionDescription,
          aiGeneratedUrl
        })
      } catch (error) {
        console.error('Error generating project vision:', error)
        throw error
      }
    }),

  // Generate detailed cost estimates for a project
  generateCostEstimate: publicProcedure
    .input(costEstimateSchema)
    .post(async ({ c, ctx, input }) => {
      const { db } = ctx
      const { projectId, description, category, scope } = input
      const { GOOGLE_AI_API_KEY } = env<Env>(c)

      try {
        // Initialize Gemini model
        const genAI = new GoogleGenerativeAI(GOOGLE_AI_API_KEY)
        const model = genAI.getGenerativeModel({ model: 'gemini-pro' })

        // Generate cost estimate
        const result = await model.generateContent([
          `Generate a detailed cost estimate for the following community project:
           Description: ${description}
           Category: ${category}
           Scope: ${JSON.stringify(scope)}
           
           Consider:
           1. Materials and equipment
           2. Labor costs
           3. Permits and fees
           4. Project management
           5. Contingency
           
           Provide detailed breakdown and assumptions.`
        ])
        const response = await result.response
        const estimateAnalysis = response.text()

        // TODO: Implement more sophisticated parsing of AI response
        const estimate = {
          id: generateId(),
          projectId,
          version: '1',
          totalEstimate: '0', // Extract from AI response
          breakdown: {}, // Extract from AI response
          assumptions: {}, // Extract from AI response
          confidenceScores: {}, // Calculate based on AI response
        }

        // Store the estimate
        await db.insert(costEstimates).values(estimate)

        return c.json({
          estimate,
          analysis: estimateAnalysis
        })
      } catch (error) {
        console.error('Error generating cost estimate:', error)
        throw error
      }
    }),

  // List AI recommendations for a fundraiser
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

        const conditions = [eq(aiRecommendations.fundraiserId, 'user123')] // TODO: Get from auth

        if (status) {
          conditions.push(eq(aiRecommendations.status, status))
        }
        if (category) {
          conditions.push(eq(aiRecommendations.category, category))
        }

        const recommendations = await baseQuery
          .where(and(...conditions))
          .orderBy(desc(aiRecommendations.createdAt))
          .limit(limit)

        return c.json({ recommendations })
      } catch (error) {
        console.error('Error listing recommendations:', error)
        throw error
      }
    }),
}) 