import { projects } from "@/server/db/schema"
import { desc, eq, InferInsertModel, like } from "drizzle-orm"
import { z } from "zod"
import { j, publicProcedure } from "../jstack"
import geohash from 'ngeohash'
import { getTreeHelpers } from "./tree-helpers/context"
import { logger } from "@/lib/logger"

export type ProjectStatus = 'draft' | 'active' | 'funded' | 'completed' | 'archived'

export type BaseProject = {
  id: string
  name: string  
  description?: string
  status: ProjectStatus
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
export type Project = Omit<BaseProject, '_meta_updated_at' | '_meta_created_at'> & {
  ["_meta_updated_at"]: Date
  ["_meta_created_at"]: Date
}

const killActiveSocketsSchema = z.object({
  socketId: z.string(),
})

const getProjectSchema = z.object({
  id: z.string(),
})

const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  status: z.enum(['draft', 'active', 'funded', 'completed', 'archived']),
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
  newProject: projectSchema,
  deleteProject: z.object({
    id: z.string(),
  }),
  setProject: projectSchema,
  unsubscribe: z.object({
    geohash: z.string(),
  }),
  subscribe: z.tuple([
    z.object({ geohash: z.string() }),
    z.array(projectSchema),
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

  getProject: publicProcedure
    .input(getProjectSchema)
    .query(async ({ c, ctx, input }) => {
      const { id } = input
      const { db } = ctx

      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, id))
        .limit(1)

      if (!project) throw new Error('Project not found')

      return c.json({
        id: project.id,
        name: project.name,
        description: project.description || undefined,
        status: project.status as ProjectStatus,
        _loc_lat: parseFloat(project._loc_lat),
        _loc_lng: parseFloat(project._loc_lng),
        _meta_created_by: project._meta_created_by,
        _meta_updated_by: project._meta_updated_by,
        _meta_updated_at: project._meta_updated_at.toISOString(),
        _meta_created_at: project._meta_created_at.toISOString()
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

                const nearbyProjects = await db
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

                if (individualProjects.length > 0) {
                  // Convert dates to proper format for emission
                  const projectsToEmit = individualProjects.map(project => ({
                    ...project,
                    _meta_updated_at: new Date(project._meta_updated_at).toISOString(),
                    _meta_created_at: new Date(project._meta_created_at).toISOString()
                  }));

                  await io.to(`geohash:${geohash}`).emit('subscribe', [{ geohash }, projectsToEmit, []])
                }

                logger.info(`Subscription complete for geohash:${geohash} - Found ${nearbyProjects.length} projects, emitted ${individualProjects.length} projects`)
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

            socket.on('deleteProject', async (data: {
              id: string
            }) => {
              logger.info(`Processing project deletion: ${data.id}`)
              const { db } = ctx

              const [project] = await db
                .select()
                .from(projects)
                .where(eq(projects.id, data.id))
                .limit(1)
      
              if (!project) {
                throw new Error('Project not found')
              }
        
              if (project.status === 'active') {
                throw new Error('Cannot delete an active project')
              }
        
              await db.delete(projects).where(eq(projects.id, data.id))
        
              const {
                getActiveSubscribers,
              } = getTreeHelpers({ ctx, logger })
        
              // Emit to all parent geohashes
              for (let precision = project._loc_geohash.length; precision > 0; precision--) {
                const parentHash = project._loc_geohash.substring(0, precision)
                const activeSocketIds = await getActiveSubscribers(parentHash, socketId ? [socketId] : [])
                for (const socketId of activeSocketIds) {
                  await io.to(`geohash:${socketId}`).emit('deleteProject', { id: data.id })
                }
              }

              try {
                await db.delete(projects).where(eq(projects.id, data.id))
              } catch (error) {
                logger.error('Error in deleteProject handler:', error)
                throw error
              }
            })

            socket.on('setProject', async (data: {
              id: string
              name: string
              description?: string
              status: ProjectStatus
              _loc_lat: number
              _loc_lng: number
              _meta_updated_by: string
              _meta_created_by: string
              _meta_updated_at: string
              _meta_created_at: string
              _view_heading?: number
              _view_pitch?: number
              _view_zoom?: number
            }) => {
              logger.info(`Processing project update: ${data.name} (${data.id})`)
              const { db } = ctx

              try {
                const hash = geohash.encode(data._loc_lat, data._loc_lng)
                console.log(data)
                console.log('created by', data._meta_created_by);
                const projectData: InferInsertModel<typeof projects> = {
                  id: data.id,
                  name: data.name,
                  description: data.description || null,
                  status: data.status,
                  fundraiser_id: data._meta_created_by,
                  _loc_lat: data._loc_lat.toString(),
                  _loc_lng: data._loc_lng.toString(),
                  _loc_geohash: hash,
                  _meta_created_by: data._meta_created_by,
                  _meta_updated_by: data._meta_updated_by,
                  _meta_updated_at: new Date(data._meta_updated_at),
                  _meta_created_at: new Date(data._meta_created_at),
                  _view_heading: data._view_heading?.toString() || null,
                  _view_pitch: data._view_pitch?.toString() || null,
                  _view_zoom: data._view_zoom?.toString() || null
                } as const;

                const existingProject = await db
                  .select()
                  .from(projects)
                  .where(eq(projects.id, data.id))
                  .limit(1)
                  .then(rows => rows[0]);

                let result;
                if (existingProject) {
                  const [updatedProject] = await db
                    .update(projects)
                    .set(projectData)
                    .where(eq(projects.id, data.id))
                    .returning();
                  if (!updatedProject) throw new Error('Failed to update project');
                  result = updatedProject;
                } else {
                  const [newProject] = await db
                    .insert(projects)
                    .values(projectData)
                    .returning();
                  if (!newProject) throw new Error('Failed to insert project');
                  result = newProject;
                }

                if (!result) {
                  throw new Error('Failed to upsert project')
                }

                const projectToEmit: BaseProject = {
                  id: result.id,
                  name: result.name,
                  description: result?.description || undefined,
                  status: result.status as ProjectStatus,
                  _loc_lat: parseFloat(result._loc_lat),
                  _loc_lng: parseFloat(result._loc_lng),
                  _meta_created_by: result._meta_created_by,
                  _meta_updated_by: result._meta_updated_by,
                  _meta_updated_at: result._meta_updated_at.toISOString(),
                  _meta_created_at: result._meta_created_at.toISOString()
                }

                const projectHash = hash
                socketId = getSocketId(socket)

                // Track metrics for geohash emissions
                let emittedCount = 0
                let skippedCount = 0
                let totalSubscribers = 0

                // Emit to all parent geohashes
                for (let precision = projectHash.length; precision > 0; precision--) {
                  const parentHash = projectHash.substring(0, precision)
                  const activeSocketIds = await getActiveSubscribers(parentHash, socketId ? [socketId] : [])
                  totalSubscribers += activeSocketIds.length
                  
                  if (activeSocketIds.length > 0) {
                    await io.to(`geohash:${parentHash}`).emit('newProject', projectToEmit)
                    emittedCount++
                  } else {
                    skippedCount++
                  }
                }

                logger.info(
                  `Project ${existingProject ? 'updated' : 'created'}: ${result.id} - ` +
                  `Emitted to ${emittedCount} geohashes (${totalSubscribers} total subscribers), ` +
                  `skipped ${skippedCount} empty geohashes`
                )

                return projectToEmit
              } catch (error) {
                logger.error('Error processing project update:', error)
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