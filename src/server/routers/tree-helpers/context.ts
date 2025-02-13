import { generateId } from "@/lib/id"
import { publicProcedure } from "../../jstack"

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

  // Clean up subscriptions on close
  const cleanup = async (socketId: string) => {
    try {
      logger.info(`Client ${socketId} disconnected, cleaning up subscriptions`)

      // Get all geohashes this socket was subscribed to
      const socketKey = getSocketKey(socketId)
      logger.debug(`Checking Redis key: ${socketKey}`)
      
      let geohashes: string[]
      try {
        geohashes = await ctx.redis.smembers(socketKey)
        logger.info(`Found ${geohashes.length} subscriptions for socket ${socketId}`)
      } catch (error) {
        logger.error('Error getting socket subscriptions:', error)
        return
      }
      
      // Remove all subscriptions
      for (const geohash of geohashes) {
        try {
          await removeSocketSubscription(geohash, socketId)
          logger.debug(`Cleaned up subscription for ${socketId} from ${geohash}`)
        } catch (error) {
          logger.error(`Error removing subscription for geohash ${geohash}:`, error)
        }
      }

      // Clean up the socket's set of subscriptions
      try {
        await ctx.redis.del(socketKey)
        logger.info(`Cleaned up all subscriptions for socket ${socketId}`)
      } catch (error) {
        logger.error('Error deleting socket key:', error)
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
  }
}   