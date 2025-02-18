import { projects } from "@/server/db/schema"
import { desc, eq, like } from "drizzle-orm"
import { z } from "zod"
import { j, publicProcedure } from "../jstack"
import geohash from 'ngeohash'
import { getTreeHelpers } from "./tree-helpers/context"
import { logger } from "@/lib/logger"
export type TreeStatus = 'draft' | 'live' | 'archived'

export type BaseTree = {
  id: string
  name: string  
  description?: string
  status: TreeStatus
  _loc_lat: number
  _loc_lng: number
  _meta_created_by: string
  _meta_updated_at: string
  _meta_updated_by: string
  _meta_created_at: string
  _view_heading?: number
  _view_pitch?: number
  _view_zoom?: number
}

// Define the tree type
export type Tree = Omit<BaseTree, '_meta_updated_at' | '_meta_created_at'> & {
  ["_meta_updated_at"]: Date
  ["_meta_created_at"]: Date
}

const killActiveSocketsSchema = z.object({
  socketId: z.string(),
})

const getTreeSchema = z.object({
  id: z.string(),
})

const treeSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  status: z.enum(['draft', 'live', 'archived']),
  _loc_lat: z.number(),
  _loc_lng: z.number(),
  _meta_created_by: z.string(),
  _meta_updated_at: z.string(),
  _meta_updated_by: z.string(),
  _meta_created_at: z.string(),
  _view_heading: z.number().optional(),
  _view_pitch: z.number().optional(),
  _view_zoom: z.number().optional(),
})

// Define the WebSocket event types
const wsEvents = z.object({
  ping: z.undefined(),
  pong: z.void(),
  newTree: treeSchema,
  deleteTree: z.object({
    id: z.string(),
  }),
  setTree: treeSchema,
  unsubscribe: z.object({
    geohash: z.string(),
  }),
  subscribe: z.tuple([
    z.object({ geohash: z.string() }),
    z.array(treeSchema),
    /**
     * Represents a collection of trees when viewing
     * map from a low precision geohash This is used
     * to emit all trees in a given area when the user zooms in
     */
    z.array(z.object({
      id: z.string(),
      city: z.string(),
      state: z.string(),
      count: z.number(),
      _loc_lat: z.number(),
      _loc_lng: z.number(),
    }))
  ]),
})

export const treeRouter = j.router({
  killActiveSockets: publicProcedure
    .input(killActiveSocketsSchema)
    .post(async ({ ctx, input }) => {
      const { socketId } = input
      const { cleanup } = getTreeHelpers({ ctx, logger })
      try {
        await cleanup(socketId)
      } catch (error) {
        logger.error('Error in killActiveSockets:', error)
        throw error
      }
    }),

  getTree: publicProcedure
    .input(getTreeSchema)
    .query(async ({ c, ctx, input }) => {
      const { id } = input
      const { db } = ctx

      const [tree] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, id))
        .limit(1)

      if (!tree) throw new Error('Tree not found')

      return c.json({
        id: tree.id,
        name: tree.name,
        description: tree.description || undefined,
        status: tree.status as TreeStatus,
        _loc_lat: parseFloat(tree._loc_lat),
        _loc_lng: parseFloat(tree._loc_lng),
        _meta_created_by: tree._meta_created_by,
        _meta_updated_by: tree._meta_updated_by,
        _meta_updated_at: tree._meta_updated_at.toISOString(),
        _meta_created_at: tree._meta_created_at.toISOString()
      })
    }),

  live: publicProcedure
    .incoming(wsEvents)
    .outgoing(wsEvents)
      .ws(({ io, ctx }) => {
        const logger = {
          info: (message: string) => console.log('Server:', message),
          error: (message: string, error?: unknown) => console.error('Server:', message, error),
          debug: (message: string) => console.log('Server:', message)
        }

        const {
          getSocketId,
          setSocketSubscription,
          removeSocketSubscription,
          cleanup,
          getActiveSubscribers,
        } = getTreeHelpers({ ctx, logger })

        let socketId: string | null = null

        logger.info('Initializing WebSocket handler')

        return {
          onMessage(data: any[]) {
            logger.debug(`Received a cool beans message: ${JSON.stringify(data)}`)
            // logger.debug(`Received message: ${JSON.stringify(data)}`)
            if (data.length === 0) return
            if (data[0] === 'ping') {
              logger.debug('Keep alive received')
              if (!socketId) return
              setSocketSubscription(socketId)
            }
          },

          onConnect({ socket }) {
            socketId = getSocketId(socket)
            logger.info('Client connected to tree updates')

            socket.on('ping', () => {
              socket.emit('pong', undefined)
            })

            // Register event handlers
            socket.on('subscribe', async ([{
              geohash
            }, treesToEmit, treeGroups]: [{
              geohash: string
            }, unknown[], unknown[]]) => {
              logger.info(`Handling subscription for area: ${geohash}`)
              const { db } = ctx

              try {
                socketId = getSocketId(socket)
                await socket.join(`geohash:${geohash}`)
                
                if (socketId) await setSocketSubscription(socketId, geohash)

                const nearbyTrees = await db
                  .select()
                  .from(projects)
                  .where(like(projects._loc_geohash, `${geohash}%`))
                  .orderBy(desc(projects._loc_geohash))

                const individualTrees = nearbyTrees
                  .map(tree => ({
                    id: tree.id,
                    name: tree.name,
                    status: tree.status as TreeStatus,
                    _loc_lat: parseFloat(tree._loc_lat),
                    _loc_lng: parseFloat(tree._loc_lng),
                    _meta_created_by: tree._meta_created_by,
                    _meta_updated_by: tree._meta_updated_by,
                    _meta_updated_at: tree._meta_updated_at.toISOString(),
                    _meta_created_at: tree._meta_created_at.toISOString()
                  }))

                if (individualTrees.length > 0) {
                  // Convert dates to proper format for emission
                  const treesToEmit = individualTrees.map(tree => ({
                    ...tree,
                    _meta_updated_at: new Date(tree._meta_updated_at).toISOString(),
                    _meta_created_at: new Date(tree._meta_created_at).toISOString()
                  }));

                  await io.to(`geohash:${geohash}`).emit('subscribe', [{ geohash }, treesToEmit, []])
                }

                logger.info(`Subscription complete for geohash:${geohash} - Found ${nearbyTrees.length} trees, emitted ${individualTrees.length} trees`)
              } catch (error) {
                logger.error('Error in subscription handler:', error)
                throw error
              }
            })

            socket.on('unsubscribe', async ({ geohash }: { geohash: string }) => {
              logger.info(`Unsubscribe event received for area: ${geohash}`)
              try {
                // Get socket ID
                socketId = getSocketId(socket)

                // Leave the Redis room for this geohash
                socket.leave(`geohash:${geohash}`)
                logger.info(`Client left Redis room for geohash:${geohash}`)

                // Remove socket from geohash subscription map
                if (!socketId) return
                await removeSocketSubscription(geohash, socketId)
              } catch (error) {
                logger.error('Error in unsubscribe handler:', error)
                throw error
              }
            })

            socket.on('deleteTree', async (data: {
              id: string
            }) => {
              logger.info(`Processing tree deletion: ${data.id}`)
              const { db } = ctx

              const [tree] = await db
                .select()
                .from(projects)
                .where(eq(projects.id, data.id))
                .limit(1)
      
              if (!tree) {
                throw new Error('Tree not found')
              }
        
              if (tree.status === 'live') {
                throw new Error('Cannot delete a live tree')
              }
        
              await db.delete(projects).where(eq(projects.id, data.id))
        
              const {
                getActiveSubscribers,
              } = getTreeHelpers({ ctx, logger })
        
              // Emit to all parent geohashes
              for (let precision = tree._loc_geohash.length; precision > 0; precision--) {
                const parentHash = tree._loc_geohash.substring(0, precision)
                const activeSocketIds = await getActiveSubscribers(parentHash, socketId ? [socketId] : [])
                for (const socketId of activeSocketIds) {
                  await io.to(`geohash:${socketId}`).emit('deleteTree', { id: data.id })
                }
              }

              try {
                await db.delete(projects).where(eq(projects.id, data.id))
              } catch (error) {
                logger.error('Error in deleteTree handler:', error)
                throw error
              }
            })

            socket.on('setTree', async (data: {
              id: string
              name: string
              description?: string
              status: TreeStatus
              _loc_lat: number
              _loc_lng: number
              _meta_updated_by: string
              _meta_created_by: string
              _meta_updated_at: string
              _meta_created_at: string
            }) => {
              logger.info(`Processing tree update: ${data.name} (${data.id})`)
              const { db } = ctx

              try {
                const hash = geohash.encode(data._loc_lat, data._loc_lng)
                const treeData = {
                  id: data.id,
                  name: data.name,
                  description: data.description,
                  status: data.status,
                  _loc_lat: data._loc_lat.toString(),
                  _loc_lng: data._loc_lng.toString(),
                  _loc_geohash: hash,
                  _meta_created_by: data._meta_created_by,
                  _meta_updated_by: data._meta_updated_by,
                  _meta_updated_at: new Date(data._meta_updated_at),
                  _meta_created_at: new Date(data._meta_created_at)
                } as const;

                const existingTree = await db
                  .select()
                  .from(projects)
                  .where(eq(projects.id, data.id))
                  .limit(1)
                  .then(rows => rows[0]);

                let result;
                if (existingTree) {
                  const [updatedTree] = await db
                    .update(projects)
                    .set(treeData)
                    .where(eq(projects.id, data.id))
                    .returning();
                  if (!updatedTree) throw new Error('Failed to update tree');
                  result = updatedTree;
                } else {
                  const [newTree] = await db
                    .insert(projects)
                    .values(treeData)
                    .returning();
                  if (!newTree) throw new Error('Failed to insert tree');
                  result = newTree;
                }

                if (!result) {
                  throw new Error('Failed to upsert tree')
                }

                const treeToEmit: BaseTree = {
                  id: result.id,
                  name: result.name,
                  description: result?.description || undefined,
                  status: result.status as TreeStatus,
                  _loc_lat: parseFloat(result._loc_lat),
                  _loc_lng: parseFloat(result._loc_lng),
                  _meta_created_by: result._meta_created_by,
                  _meta_updated_by: result._meta_updated_by,
                  _meta_updated_at: result._meta_updated_at.toISOString(),
                  _meta_created_at: result._meta_created_at.toISOString()
                }

                const treeHash = hash
                socketId = getSocketId(socket)

                // Track metrics for geohash emissions
                let emittedCount = 0
                let skippedCount = 0
                let totalSubscribers = 0

                // Emit to all parent geohashes
                for (let precision = treeHash.length; precision > 0; precision--) {
                  const parentHash = treeHash.substring(0, precision)
                  const activeSocketIds = await getActiveSubscribers(parentHash, socketId ? [socketId] : [])
                  totalSubscribers += activeSocketIds.length
                  
                  if (activeSocketIds.length > 0) {
                    await io.to(`geohash:${parentHash}`).emit('newTree', treeToEmit)
                    emittedCount++
                  } else {
                    skippedCount++
                  }
                }

                logger.info(
                  `Tree ${existingTree ? 'updated' : 'created'}: ${result.id} - ` +
                  `Emitted to ${emittedCount} geohashes (${totalSubscribers} total subscribers), ` +
                  `skipped ${skippedCount} empty geohashes`
                )

                return treeToEmit
              } catch (error) {
                logger.error('Error processing tree update:', error)
                throw error
              }
            })
            
            // Send initial message to confirm connection
            logger.debug('Sending connection confirmation message')
            socket.emit('pong', undefined);

            // Return cleanup function
            socketId = getSocketId(socket)

            return () => {
              if (!socketId) return
              cleanup(socketId)
            }
          },
          
          onError: async ({ error }: { error: Event }) => {
            logger.info(`[Process ${process.pid}] WebSocket: ${socketId}`)
            logger.error('WebSocket error:', error)
            if (!socketId) return;
            
            logger.info(`[Process ${process.pid}] Initiating cleanup via REST for socket ${socketId} in onError`)
            try {
              // Call the killActiveSockets endpoint instead of direct cleanup
              const response = await fetch('/api/trpc/tree.killActiveSockets', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  socketId
                })
              })

              if (!response.ok) {
                throw new Error(`Failed to kill socket: ${response.statusText}`)
              }

              logger.info(`[Process ${process.pid}] REST cleanup initiated for socket ${socketId} in onError`)
            } catch (error) {
              logger.error(`[Process ${process.pid}] Error initiating REST cleanup in onError:`, error)
            }
          },
          
          onClose: async ({ socket }: { socket: any }) => {
            logger.info(`[Process ${process.pid}] WebSocket connection closed`)
            socketId = getSocketId(socket)
            if (!socketId) return;
            
            logger.info(`[Process ${process.pid}] Initiating cleanup via REST for socket ${socketId} in onClose`)
            try {
              // Call the killActiveSockets endpoint instead of direct cleanup
              const response = await fetch('/api/trpc/tree.killActiveSockets', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  socketId
                })
              })

              if (!response.ok) {
                throw new Error(`Failed to kill socket: ${response.statusText}`)
              }

              logger.info(`[Process ${process.pid}] REST cleanup initiated for socket ${socketId} in onClose`)
            } catch (error) {
              logger.error(`[Process ${process.pid}] Error initiating REST cleanup in onClose:`, error)
            }
          }
        }
    })
}) 