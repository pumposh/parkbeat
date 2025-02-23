import { generateId } from "@/lib/id"
import { publicProcedure } from "../../jstack"
import { eq, desc, like } from "drizzle-orm"
import { projectImages, projects, projectSuggestions } from "@/server/db/schema"
import type { ProjectData } from "@/server/types/shared"
import type { ServerProcedure } from "../tree-router"
import type { ProjectStatus } from "@/server/types/shared"
import { ContextWithSuperJSON } from "jstack"
import { Env as JstackEnv } from "../../jstack"

type Logger = {
  info: (...args: Parameters<typeof console.info>) => void
  error: (...args: Parameters<typeof console.error>) => void
  debug: (...args: Parameters<typeof console.debug>) => void
}

type ProcedureEnv = ContextWithSuperJSON<JstackEnv>
type ProcedureContext = Parameters<Parameters<typeof publicProcedure.ws>[0]>[0]['ctx']

export const getTreeHelpers = ({ ctx, logger }: { ctx: ProcedureContext, logger: Logger }) => {
  // Helper function to get Redis key for geohash subscriptions
  const getGeohashKey = (geohash: string): string => `geohash:${geohash}:sockets`
  const getProjectKey = (projectId: string): string => `project:${projectId}:sockets`
  const getSocketGeohashKey = (socketId: string): string => `sockets:${socketId}:geohashes`
  const getSocketProjectsKey = (socketId: string): string => `sockets:${socketId}:projects`

  const getSocketId = (socket: any) => {
    if ('_socketId' in socket) {
      return socket._socketId
    }
    const id = `socket_${generateId()}`
    socket._socketId = id
    return id
  }

  const getMostRecentSubscription = async (socketId: string) => {
    const socketKey = getSocketGeohashKey(socketId)
    const geohashes = await ctx.redis.smembers(socketKey)
    if (geohashes.length === 0) return null
    return geohashes[geohashes.length - 1]
  }

  const getLastSubscriptionTime = async (socketId: string) => {
    const socketKey = getSocketGeohashKey(socketId)
    const geohashes = await ctx.redis.smembers(socketKey)
    if (geohashes.length === 0) return null

    const geohash = geohashes[geohashes.length - 1]
    if (!geohash) return null

    const geohashKey = getGeohashKey(geohash)
    const lastSubscriptionTime: number | string | null = await ctx.redis.hget(geohashKey, socketId)

    if (typeof lastSubscriptionTime === 'string') {
      return new Date(parseInt(lastSubscriptionTime))
    } else if (typeof lastSubscriptionTime === 'number') {
      return new Date(lastSubscriptionTime)
    } else {
      return null
    }
  }

  const expireSubscriptionsAfter = 15000
  const getIsLastSubscriptionRecent = async (socketId: string) => {
    const lastSubscriptionTime = await getLastSubscriptionTime(socketId)
    if (!lastSubscriptionTime) return false
    const fifteenSecondsAgo = new Date(Date.now() - expireSubscriptionsAfter)
    return lastSubscriptionTime > fifteenSecondsAgo
  }

  // Helper function to add socket subscription
  const setSocketSubscription = async (socketId: string, geohash?: string) => {
    const socketKey = getSocketGeohashKey(socketId)
    const geohashKey = geohash ? getGeohashKey(geohash) : await getMostRecentSubscription(socketId)
    
    logger.debug(`Setting subscription: Socket=${socketKey}, Geohash=${geohashKey}`)
    if (!geohashKey) return

    const isLastSubscriptionRecent = await getIsLastSubscriptionRecent(socketId)
    if (isLastSubscriptionRecent) {
      logger.debug(`Last subscription is quite recent, skipping`)
      return
    }
    
    logger.debug(`Setting subscription: Socket=${socketKey}, Geohash=${geohashKey}`)
    
    try {
      // Add socket to geohash's subscribers
      await ctx.redis.hset(geohashKey, { [socketId]: Date.now() })
      logger.debug(`Set socket to geohash subscribers`)
    } catch (error) {
      logger.error('Error setting socket to geohash:', error)
      throw error
    }

    try {
      // Add geohash to socket's subscriptions
      await ctx.redis.sadd(socketKey, geohash)
      logger.debug(`Set geohash to socket subscriptions`)
    } catch (error) {
      logger.error('Error setting geohash to socket subscriptions:', error)
      // Try to rollback the geohash subscription
      await ctx.redis.hdel(geohashKey, socketId).catch(e => 
        logger.error('Error rolling back geohash subscription:', e)
      )
      throw error
    }
    
    const count = await ctx.redis.hlen(geohashKey)
    logger.debug(`Added socket ${socketId} to geohash ${geohash} (total: ${count})`)
    return count
  }

  // Helper function to remove socket subscription
  const removeSocketSubscription = async (geohash: string, socketId: string) => {
    const geohashKey = getGeohashKey(geohash)
    const socketKey = getSocketGeohashKey(socketId)
    
    // Remove socket from geohash's subscribers
    await ctx.redis.hdel(geohashKey, socketId)
    // Remove geohash from socket's subscriptions
    await ctx.redis.srem(socketKey, geohash)
    
    const count = await ctx.redis.hlen(geohashKey)
    if (count === 0) {
      await ctx.redis.del(geohashKey)
      logger.debug(`Removed empty geohash key ${geohash}`)
    }
    logger.debug(`Removed socket ${socketId} from geohash ${geohash} (total: ${count})`)
    return count
  }

  // Helper function to get active subscribers and clean up inactive ones
  const getActiveSubscribers = async (geohash: string, excludeSocketIds: string[] = []) => {
    const key = getGeohashKey(geohash)
    const subscribers = (await ctx.redis.hgetall(key)) || {}
    const activeSocketIds: Set<string> = new Set()
    const excludedSocketIds: Set<string> = new Set(excludeSocketIds)

    for (const socketId of Object.keys(subscribers)) {
      if (excludedSocketIds.has(socketId)) continue
      activeSocketIds.add(socketId)
    }

    return Array.from(activeSocketIds)
  }

  // Helper function to add project subscription
  const setProjectSubscription = async (socketId: string, projectId: string) => {
    const projectKey = getProjectKey(projectId)
    const socketProjectsKey = getSocketProjectsKey(socketId)
    
    logger.debug(`Setting project subscription: Socket=${socketId}, Project=${projectId}`)
    
    try {
      // Add socket to project's subscribers
      await ctx.redis.hset(projectKey, { [socketId]: Date.now() })
      logger.debug(`Set socket to project subscribers`)
    } catch (error) {
      logger.error('Error setting socket to project:', error)
      throw error
    }

    try {
      // Add project to socket's subscriptions
      await ctx.redis.sadd(socketProjectsKey, projectId)
      logger.debug(`Set project to socket subscriptions`)
    } catch (error) {
      logger.error('Error setting project to socket subscriptions:', error)
      // Try to rollback the project subscription
      await ctx.redis.hdel(projectKey, socketId).catch(e => 
        logger.error('Error rolling back project subscription:', e)
      )
      throw error
    }
    
    const count = await ctx.redis.hlen(projectKey)
    logger.debug(`Added socket ${socketId} to project ${projectId} (total: ${count})`)
    return count
  }

  // Helper function to remove project subscription
  const removeProjectSubscription = async (projectId: string, socketId: string) => {
    const projectKey = getProjectKey(projectId)
    const socketProjectsKey = getSocketProjectsKey(socketId)
    
    // Remove socket from project's subscribers
    await ctx.redis.hdel(projectKey, socketId)
    // Remove project from socket's subscriptions
    await ctx.redis.srem(socketProjectsKey, projectId)
    
    const count = await ctx.redis.hlen(projectKey)
    if (count === 0) {
      await ctx.redis.del(projectKey)
      logger.debug(`Removed empty project key ${projectId}`)
    }
    logger.debug(`Removed socket ${socketId} from project ${projectId} (total: ${count})`)
    return count
  }

  // Helper function to get active project subscribers
  const getActiveProjectSubscribers = async (projectId: string, excludeSocketIds: string[] = []) => {
    const key = getProjectKey(projectId)
    const subscribers = (await ctx.redis.hgetall(key)) || {}
    const activeSocketIds: Set<string> = new Set()
    const cleanupPromises: Promise<void>[] = []

    const twentySecondsAgo = Date.now() - 20000

    for (const [socketId, timestampStr] of Object.entries(subscribers)) {
      const timestamp = parseInt(String(timestampStr))
      if (timestamp > twentySecondsAgo) {
        activeSocketIds.add(socketId)
      } else {
        // Add cleanup promise for inactive subscriber
        cleanupPromises.push(
          cleanup(socketId).catch(error => {
            logger.error(`Error cleaning up inactive socket ${socketId}:`, error)
          })
        )
      }
    }

    // Execute all cleanup operations in parallel
    if (cleanupPromises.length > 0) {
      await Promise.all(cleanupPromises)
    }

    excludeSocketIds.forEach(socketId => {
      activeSocketIds.delete(socketId)
    })

    return Array.from(activeSocketIds)
  }

  const notifyGeohashSubscribers = async (geohash: string, io: IO) => {
    const key = getGeohashKey(geohash)
    const sockets = await ctx.redis.smembers(key)
    for (const socket of sockets) {
      const nearbyProjects = await ctx.db
        .select()
        .from(projects)
        .where(like(projects._loc_geohash, `${geohash}%`))
        .orderBy(desc(projects._loc_geohash))

      const individualProjects = nearbyProjects
        .map(project => ({
          id: project.id,
          name: project.name,
          status: project.status as ProjectStatus,
          _loc_lat: parseFloat(project._loc_lat),
          _loc_lng: parseFloat(project._loc_lng),
          _meta_created_by: project._meta_created_by,
          _meta_updated_by: project._meta_updated_by,
          _meta_updated_at: project._meta_updated_at.toISOString(),
          _meta_created_at: project._meta_created_at.toISOString()
        }))

    }
  }

  // Helper function to get all project data
  const getProjectData = async (projectId: string): Promise<ProjectData | null> => {
    logger.debug(`Getting project data for: ${projectId}`)
    const { db } = ctx

    try {
      // Get project details
      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1)

      if (!project) {
        logger.error(`Project not found: ${projectId}`)
        return null;
      }

      // Format project data
      const projectData: ProjectData['project'] = {
        id: project.id,
        name: project.name,
        description: project.description || undefined,
        fundraiser_id: project.fundraiser_id,
        status: project.status,
        _loc_lat: parseFloat(project._loc_lat),
        _loc_lng: parseFloat(project._loc_lng),
        _loc_geohash: project._loc_geohash,
        _meta_created_by: project._meta_created_by,
        _meta_updated_by: project._meta_updated_by,
        _meta_updated_at: project._meta_updated_at.toISOString(),
        _meta_created_at: project._meta_created_at.toISOString(),
        _view_heading: project._view_heading ? parseFloat(project._view_heading) : undefined,
        _view_pitch: project._view_pitch ? parseFloat(project._view_pitch) : undefined,
        _view_zoom: project._view_zoom ? parseFloat(project._view_zoom) : undefined
      }

      // Get project images
      const images = await db
        .select()
        .from(projectImages)
        .where(eq(projectImages.project_id, projectId))
        .orderBy(desc(projectImages.created_at))

      // Get project suggestions (if you have a suggestions table)
      const suggestions = await db
        .select()
        .from(projectSuggestions)
        .where(eq(projectSuggestions.project_id, projectId))
        .orderBy(desc(projectSuggestions.created_at))

      return {
        project: projectData,
        images: images.map(image => ({
          id: image.id,
          type: image.type,
          imageUrl: image.image_url,
          aiAnalysis: image.ai_analysis
        })),
        suggestions: suggestions.map(suggestion => ({
          id: suggestion.id,
          title: suggestion.title,
          summary: suggestion.description,
          fundraiser_id: suggestion.fundraiser_id,
          project_id: suggestion.project_id,
          confidence: suggestion.confidence,
          reasoning_context: suggestion.reasoning_context,
          status: suggestion.status,
          created_at: suggestion.created_at,
          imagePrompt: suggestion.imagePrompt,
          category: suggestion.category,
          estimatedCost: suggestion.estimated_cost as { total: number },
          images: suggestion.images as {
            generated: Array<{ url: string; generatedAt: string; generationId: string }>,
            source: { url: string; id: string },
            upscaled: { url: string; id: string }
          }
        }))
      }
    } catch (error) {
      logger.error(`Error getting project data for ${projectId}:`, error)
      throw error
    }
  }

  type IO = Parameters<Parameters<ServerProcedure["ws"]>[0]>[0]['io']
  // Helper function to notify all project subscribers of updates
  const notifyProjectSubscribers = async (projectId: string, socketId: string | null, io: IO) => {
    logger.debug(`Notifying subscribers of updates to project: ${projectId}`)
    try {
      // Get updated project data
      const projectData = await getProjectData(projectId)

      if (!projectData) return;
      
      // Emit to all subscribers in the project's room
      await io.to(`project:${projectId}`).emit('projectData', {
        projectId,
        data: projectData
      })

      const project = projectData?.project;

      if (project?._loc_geohash) {
        for (let precision = project._loc_geohash.length; precision > 0; precision--) {
          const parentHash = project._loc_geohash.substring(0, precision)
          const activeSocketIds = await getActiveSubscribers(parentHash)
          if (activeSocketIds.length > 0) {
            await io.to(`geohash:${parentHash}`).emit('projectData', {
              projectId,
              data: projectData
            })
          }
        }
      }
      
      logger.debug(`Successfully notified project subscribers for ${projectId}`)
    } catch (error) {
      logger.error(`Error notifying project subscribers for ${projectId}:`, error)
      throw error
    }
  }

  // Clean up subscriptions on close
  const cleanup = async (socketId: string, subscriptions: ('geohash' | 'project')[] = ['geohash', 'project']) => {
    try {
      logger.info(`Client ${socketId}: cleaning up subscriptions`)

      // Get all geohashes this socket was subscribed to
      const socketKey = getSocketGeohashKey(socketId)
      const socketProjectsKey = getSocketProjectsKey(socketId)
      const keys = [];
      if (subscriptions.includes('geohash')) {
        keys.push(socketKey)
      }
      if (subscriptions.includes('project')) {
        keys.push(socketProjectsKey)
      }

      logger.debug(`Checking Redis keys: ${socketKey}, ${socketProjectsKey}`)
      
      let refKeys: string[]
      try {
        refKeys = await Promise.all(keys.map(key => ctx.redis.smembers(key))).then(keys => keys.flat());
        logger.info(`Found ${refKeys.length} subscriptions for socket ${socketId}`)
      } catch (error) {
        logger.error('Error getting socket subscriptions:', error)
        return
      }

      // Clean up the socket's sets of subscriptions
      try {
        await Promise.all([
          ...keys.map(key => ctx.redis.del(key)),
          ctx.redis.hdel('cleanupQueue', socketId)
        ])
        logger.info(`Cleaned up all subscriptions for socket ${socketId}`)
      } catch (error) {
        logger.error('Error deleting socket keys:', error)
      }
      
      // Remove all subscriptions
      for (const refKey of refKeys) {
        try {
          await removeSocketSubscription(refKey, socketId)
          logger.debug(`Cleaned up geohash subscription for ${socketId} from ${refKey}`)
        } catch (error) {
          logger.error(`Error removing subscription for ${refKey}:`, error)
        }
      }
    } catch (error) {
      logger.error('Error in cleanup:', error)
    }
  }

  const enqueueSubscriptionCleanup = (
    c: ProcedureEnv,
    socketId: string,
    subscriptions: ('geohash' | 'project')[] = ['geohash', 'project'],
  ) => {
    try {
      logger.info(`[Process ${process.pid}] Adding socket ${socketId} to cleanup queue`)
      
      // Get Redis connection details from environment
      const redisUrl = c.env.UPSTASH_REDIS_REST_URL

      const body = {
        timestamp: Date.now(),
        subscriptions
      }

      // Use global fetch for network request
      fetch(redisUrl + '/hset/cleanupQueue/' + socketId , {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${c.env.UPSTASH_REDIS_REST_TOKEN}`,
        },
        body: JSON.stringify(body)
      })

    } catch (error) {
      logger.error(`[Process ${process.pid}] Failed to queue socket ${socketId} for cleanup:`, error)
    }
  }

  const processCleanupQueue = async () => {
    try {
      // Get all entries from cleanup queue
      const queueEntries: Record<string, {
        timestamp: number,
        subscriptions: ('geohash' | 'project')[]
      }> | null = await ctx.redis.hgetall('cleanupQueue')

      if (!queueEntries || Object.keys(queueEntries).length === 0) return

      logger.info(`[Process ${process.pid}] Processing cleanup queue with ${Object.keys(queueEntries).length} entries`)

      // Process each socket in parallel
      await Promise.allSettled(
        Object.entries(queueEntries).map(async ([socketId, { timestamp, subscriptions }]) => {
          try {
            await cleanup(socketId, subscriptions)
            // Remove from queue only if cleanup succeeds
            // await ctx.redis.hdel('cleanupQueue', socketId)
            logger.info(`[Process ${process.pid}] Cleaned up and removed socket ${socketId} from queue`)
          } catch (error) {
            // If the socket is too old, remove it from the queue
            const age = Date.now() - parseInt(`${timestamp}`)
            if (age > 24 * 60 * 60 * 1000) { // 24 hours
              await ctx.redis.hdel('cleanupQueue', socketId)
              logger.info(`[Process ${process.pid}] Removed stale socket ${socketId} from queue (age: ${age}ms)`)
            } else {
              logger.error(`[Process ${process.pid}] Failed to clean up socket ${socketId}:`, error)
            }
          }
        })
      )
    } catch (error) {
      logger.error(`[Process ${process.pid}] Error processing cleanup queue:`, error)
    }
  }
  return {
    getSocketId,
    setSocketSubscription,
    removeSocketSubscription,
    cleanup,
    getMostRecentSubscription,
    getActiveSubscribers,
    setProjectSubscription,
    removeProjectSubscription,
    getActiveProjectSubscribers,
    getProjectData,
    notifyProjectSubscribers,
    enqueueSubscriptionCleanup,
    processCleanupQueue
  }
}   