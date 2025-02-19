import { generateId } from "@/lib/id"
import { publicProcedure } from "../../jstack"
import { eq, desc } from "drizzle-orm"
import { projectImages, projects, projectSuggestions } from "@/server/db/schema"
import { ProjectData } from "../tree-router"
import type { ServerProcedure } from "../tree-router"
type Logger = {
  info: (message: string) => void
  error: (message: string, error?: unknown) => void
  debug: (message: string) => void
}

type ProcedureContext = Parameters<Parameters<typeof publicProcedure.ws>[0]>[0]['ctx']

export const getTreeHelpers = ({ ctx, logger }: { ctx: ProcedureContext, logger: Logger }) => {
  // Helper function to get Redis key for geohash subscriptions
  const getGeohashKey = (geohash: string) => `geohash:${geohash}:sockets`
  const getSocketKey = (socketId: string) => `sockets:${socketId}:geohashes`
  const getProjectKey = (projectId: string) => `project:${projectId}:sockets`
  const getSocketProjectsKey = (socketId: string) => `sockets:${socketId}:projects`

  const getSocketId = (socket: any) => {
    if ('_socketId' in socket) {
      return socket._socketId
    }
    const id = `socket_${generateId()}`
    socket._socketId = id
    return id
  }

  const getMostRecentSubscription = async (socketId: string) => {
    const socketKey = getSocketKey(socketId)
    const geohashes = await ctx.redis.smembers(socketKey)
    if (geohashes.length === 0) return null
    return geohashes[geohashes.length - 1]
  }

  const getLastSubscriptionTime = async (socketId: string) => {
    const socketKey = getSocketKey(socketId)
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
    const socketKey = getSocketKey(socketId)
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
    const socketKey = getSocketKey(socketId)
    
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

  const cleanupInactiveSubscriptions = async (geohash: string) => {
    const key = getGeohashKey(geohash)
    const sockets = await ctx.redis.smembers(key)
    for (const socket of sockets) {
      const socketId = socket.split(':')[1]
      if (!socketId) continue
      await cleanup(socketId)
    }
  }

  // Helper function to get active subscribers and clean up inactive ones
  const getActiveSubscribers = async (geohash: string, excludeSocketIds: string[] = []) => {
    const key = getGeohashKey(geohash)
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

  // Helper function to get all project data
  const getProjectData = async (projectId: string): Promise<ProjectData> => {
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
        throw new Error('Project not found')
      }

      // Format project data
      const projectData: ProjectData['project'] = {
        id: project.id,
        name: project.name,
        description: project.description || undefined,
        status: project.status,
        _loc_lat: parseFloat(project._loc_lat),
        _loc_lng: parseFloat(project._loc_lng),
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
          imagePrompt: suggestion.image_prompt,
          generatedImageUrl: suggestion.generated_image_url || undefined
        }))
      }
    } catch (error) {
      logger.error(`Error getting project data for ${projectId}:`, error)
      throw error
    }
  }

  type IO = Parameters<Parameters<ServerProcedure["ws"]>[0]>[0]['io']
  // Helper function to notify all project subscribers of updates
  const notifyProjectSubscribers = async (projectId: string, io: IO) => {
    logger.debug(`Notifying subscribers of updates to project: ${projectId}`)
    try {
      // Get updated project data
      const projectData = await getProjectData(projectId)
      
      // Emit to all subscribers in the project's room
      await io.to(`project:${projectId}`).emit('projectData', {
        projectId,
        data: projectData
      })
      
      logger.debug(`Successfully notified project subscribers for ${projectId}`)
    } catch (error) {
      logger.error(`Error notifying project subscribers for ${projectId}:`, error)
      throw error
    }
  }

  // Clean up subscriptions on close
  const cleanup = async (socketId: string) => {
    try {
      logger.info(`Client ${socketId} disconnected, cleaning up subscriptions`)

      // Get all geohashes this socket was subscribed to
      const socketKey = getSocketKey(socketId)
      const socketProjectsKey = getSocketProjectsKey(socketId)
      logger.debug(`Checking Redis keys: ${socketKey}, ${socketProjectsKey}`)
      
      let geohashes: string[]
      let projectIds: string[]
      try {
        [geohashes, projectIds] = await Promise.all([
          ctx.redis.smembers(socketKey),
          ctx.redis.smembers(socketProjectsKey)
        ])
        logger.info(`Found ${geohashes.length} geohash subscriptions and ${projectIds.length} project subscriptions for socket ${socketId}`)
      } catch (error) {
        logger.error('Error getting socket subscriptions:', error)
        return
      }
      
      // Remove all subscriptions
      for (const geohash of geohashes) {
        try {
          await removeSocketSubscription(geohash, socketId)
          logger.debug(`Cleaned up geohash subscription for ${socketId} from ${geohash}`)
        } catch (error) {
          logger.error(`Error removing subscription for geohash ${geohash}:`, error)
        }
      }

      for (const projectId of projectIds) {
        try {
          await removeProjectSubscription(projectId, socketId)
          logger.debug(`Cleaned up project subscription for ${socketId} from ${projectId}`)
        } catch (error) {
          logger.error(`Error removing subscription for project ${projectId}:`, error)
        }
      }

      // Clean up the socket's sets of subscriptions
      try {
        await Promise.all([
          ctx.redis.del(socketKey),
          ctx.redis.del(socketProjectsKey)
        ])
        logger.info(`Cleaned up all subscriptions for socket ${socketId}`)
      } catch (error) {
        logger.error('Error deleting socket keys:', error)
      }
    } catch (error) {
      logger.error('Error in cleanup:', error)
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
    notifyProjectSubscribers
  }
}   