import { generateId } from "@/lib/id"
import { publicProcedure } from "../../jstack"
import { eq, desc, like, asc, sql, sum, count, and } from "drizzle-orm"
import { projectImages, projects, projectSuggestions, projectContributions } from "@/server/db/schema"
import type { BaseProject, ProjectData, ProjectSuggestion, ContributionSummary, ProjectContribution, ContributorSummary } from "@/server/types/shared"
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
  const removeSocketSubscription = async (val: string, socketId: string) => {
    const geohashKey = getGeohashKey(val)
    const projectKey = getProjectKey(val)
    const socketKey = getSocketGeohashKey(socketId)
    const socketProjectsKey = getSocketProjectsKey(socketId)
    
    // Remove socket from geohash's subscribers
    await ctx.redis.hdel(geohashKey, socketId)
    // Remove geohash from socket's subscriptions
    await ctx.redis.srem(socketKey, val)

    // Remove socket from project's subscribers
    await ctx.redis.hdel(projectKey, socketId)
    // Remove project from socket's subscriptions
    await ctx.redis.srem(socketProjectsKey, val)
    
    const geohashCount = await ctx.redis.hlen(geohashKey)
    const projectCount = await ctx.redis.hlen(projectKey)
    if (geohashCount === 0) {
      await ctx.redis.del(geohashKey)
      logger.debug(`Removed empty geohash key ${val}`)
    }
    if (projectCount === 0) {
      await ctx.redis.del(projectKey)
      logger.debug(`Removed empty project key ${val}`)
    }
    logger.debug(`Removed socket ${socketId} from ${val} (geohash: ${geohashCount}, project: ${projectCount})`)
    return { geohashCount, projectCount }
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

  // Helper function to get contribution summary for a project
  const getContributionSummary = async (projectId: string): Promise<ContributionSummary> => {
    logger.debug(`Getting contribution summary for project: ${projectId}`)
    const { db } = ctx

    try {
      // Get total amount and count
      const totalResult = await db
        .select({
          total_amount_cents: sql<number>`COALESCE(SUM(${projectContributions.amount_cents}), 0)`.as('total_amount_cents'),
          contributor_count: sql<number>`COUNT(DISTINCT ${projectContributions.user_id})`.as('contributor_count')
        })
        .from(projectContributions)
        .where(and(
          eq(projectContributions.project_id, projectId),
          eq(projectContributions.contribution_type, 'funding')
        ))

      const total = totalResult[0] || { total_amount_cents: 0, contributor_count: 0 }

      // Get contributors with their total contributions, sorted by total amount
      const contributors = await db
        .select({
          user_id: projectContributions.user_id,
          total_amount_cents: sql<number>`COALESCE(SUM(${projectContributions.amount_cents}), 0)`.as('total_amount_cents'),
          contribution_count: sql<number>`COUNT(*)`.as('contribution_count')
        })
        .from(projectContributions)
        .where(and(
          eq(projectContributions.project_id, projectId),
          eq(projectContributions.contribution_type, 'funding')
        ))
        .groupBy(projectContributions.user_id)
        .orderBy(desc(sql<number>`COALESCE(SUM(${projectContributions.amount_cents}), 0)`))

      // Get recent contributions (last 10)
      const recentContributions = await db
        .select()
        .from(projectContributions)
        .where(eq(projectContributions.project_id, projectId))
        .orderBy(desc(projectContributions.created_at))
        .limit(10)

      return {
        total_amount_cents: total.total_amount_cents,
        contributor_count: total.contributor_count,
        contributors: contributors.map((contributor: ContributorSummary) => ({
          user_id: contributor.user_id,
          total_amount_cents: contributor.total_amount_cents,
          contribution_count: contributor.contribution_count
        })),
        recent_contributions: recentContributions.map(contribution => ({
          id: contribution.id,
          project_id: contribution.project_id,
          user_id: contribution.user_id,
          contribution_type: contribution.contribution_type,
          amount_cents: contribution.amount_cents ? Number(contribution.amount_cents) : undefined,
          message: contribution.message || undefined,
          created_at: contribution.created_at.toISOString(),
          metadata: contribution.metadata as Record<string, unknown> || undefined
        }))
      }
    } catch (error) {
      logger.error(`Error getting contribution summary for project ${projectId}:`, error)
      // Return empty summary on error
      return {
        total_amount_cents: 0,
        contributor_count: 0,
        contributors: [],
        recent_contributions: []
      }
    }
  }

  /**
   * Adds a contribution to a project
   * @param contribution The contribution details (excluding id, metadata, and created_at which are handled automatically)
   * @returns The newly created contribution
   */
  const addProjectContribution = async (contribution: {
    project_id: string;
    user_id: string;
    contribution_type: 'funding' | 'social';
    amount_cents?: number;
    message?: string;
    id?: string; // Make ID optional in the parameter
  }): Promise<ProjectContribution> => {
    logger.debug(`Adding contribution to project: ${contribution.project_id}`)
    const { db } = ctx
    
    try {
      // Use provided ID or generate a new one
      const id = contribution.id || generateId()
      
      // Check if a contribution with this ID already exists
      if (contribution.id) {
        const existingContribution = await db
          .select({ id: projectContributions.id })
          .from(projectContributions)
          .where(eq(projectContributions.id, contribution.id))
          .limit(1)
        
        // If contribution already exists, return it without creating a duplicate
        if (existingContribution.length > 0) {
          logger.info(`Contribution with ID ${contribution.id} already exists, skipping creation`)
          
          // Fetch the existing contribution to return
          const [existing] = await db
            .select()
            .from(projectContributions)
            .where(eq(projectContributions.id, contribution.id))
            .limit(1)

          if (!existing) {
            logger.error(`Contribution with ID ${contribution.id} not found`)
            throw new Error(`Contribution with ID ${contribution.id} not found`)
          }
          
          // Return the existing contribution formatted according to ProjectContribution type
          return {
            id: existing.id,
            project_id: existing.project_id,
            user_id: existing.user_id,
            contribution_type: existing.contribution_type as 'funding' | 'social',
            amount_cents: existing.amount_cents ? Number(existing.amount_cents) : undefined,
            message: existing.message || undefined,
            created_at: existing.created_at.toISOString(),
            metadata: existing.metadata as Record<string, unknown> || {}
          }
        }
      }
      
      // Create the contribution record
      const newContribution = {
        id,
        ...contribution,
        created_at: new Date(),
        metadata: {} // Initialize with empty metadata
      }
      
      // Insert into the database
      await db.insert(projectContributions).values({
        id: newContribution.id,
        project_id: newContribution.project_id,
        user_id: newContribution.user_id,
        contribution_type: newContribution.contribution_type,
        amount_cents: newContribution.amount_cents?.toString(), // Convert to string for DB
        message: newContribution.message,
        created_at: newContribution.created_at,
        metadata: newContribution.metadata
      })
      
      // Return the created contribution formatted according to ProjectContribution type
      return {
        id,
        project_id: contribution.project_id,
        user_id: contribution.user_id,
        contribution_type: contribution.contribution_type,
        amount_cents: contribution.amount_cents,
        message: contribution.message,
        created_at: newContribution.created_at.toISOString(),
        metadata: {}
      }
    } catch (error) {
      logger.error(`Error adding contribution to project ${contribution.project_id}:`, error)
      throw error
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

      const projectData: BaseProject = {
        ...project,
        cost_breakdown: project.cost_breakdown || undefined,
        source_suggestion_id: project.source_suggestion_id || undefined,
        description: project.description || undefined,
        _view_heading: project._view_heading ? parseFloat(project._view_heading) : undefined,
        _view_pitch: project._view_pitch ? parseFloat(project._view_pitch) : undefined,
        _view_zoom: project._view_zoom ? parseFloat(project._view_zoom) : undefined,
        _loc_lat: parseFloat(project._loc_lat),
        _loc_lng: parseFloat(project._loc_lng),
        _meta_created_at: project._meta_created_at.toISOString(),
        _meta_updated_at: project._meta_updated_at.toISOString(),
        _meta_created_by: project._meta_created_by,
        _meta_updated_by: project._meta_updated_by,
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

      // Get contribution summary
      const contributionSummary = await getContributionSummary(projectId)

      return {
        project: projectData,
        images: images.map(image => ({
          id: image.id,
          type: image.type,
          imageUrl: image.image_url,
          aiAnalysis: image.ai_analysis
        })),
        suggestions: suggestions.map(suggestion => ({
          ...suggestion,
          id: suggestion.id,
          title: suggestion.title,
          summary: suggestion.description,
          fundraiser_id: suggestion.fundraiser_id,
          project_id: suggestion.project_id || undefined,
          reasoning_context: suggestion.reasoning_context || '',
          status: suggestion.status,
          created_at: suggestion.created_at.toISOString(),
          imagePrompt: suggestion.imagePrompt,
          category: suggestion.category,
          metadata: suggestion.metadata as Record<string, unknown>,
          estimatedCost: suggestion.estimated_cost as ProjectSuggestion['estimatedCost'],
          images: suggestion.images || {
            upscaled: {},
            source: {},
            generated: [],
            status: {
              isUpscaling: false,
              isGenerating: false,
              lastError: null
            }
          },
        })),
        contribution_summary: contributionSummary
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
        logger.info(`Found ${refKeys.length} subscriptions for socket ${socketId}, ${refKeys}`)
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
    getContributionSummary,
    addProjectContribution,
    notifyProjectSubscribers,
    enqueueSubscriptionCleanup,
    processCleanupQueue
  }
}   