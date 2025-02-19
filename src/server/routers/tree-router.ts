import { projects } from "@/server/db/schema"
import { desc, eq, InferInsertModel, like } from "drizzle-orm"
import { z } from "zod"
import { j, publicProcedure } from "../jstack"
import { getTreeHelpers } from "./tree-helpers/context"
import { logger } from "@/lib/logger"
import { projectClientEvents, projectServerEvents, ProjectStatus, setupProjectHandlers } from "./socket/project-handlers"

const killActiveSocketsSchema = z.object({
  socketId: z.string(),
})

const getProjectSchema = z.object({
  id: z.string(),
})

// Define the WebSocket event types
/** Client sends to server */
const clientEvents = z.object({
  ping: z.undefined(),
  ...projectClientEvents
})

/** Server sends to client */
const serverEvents = z.object({
  pong: z.void(),
  ...projectServerEvents
})

export type ProjectData = z.infer<typeof serverEvents>['projectData']['data']
export type ClientEvents = z.infer<typeof clientEvents>
export type ServerEvents = z.infer<typeof serverEvents>

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
    .incoming(clientEvents)
    .outgoing(serverEvents)
    .ws(({ io, ctx }) => {
      const logger = {
        info: (message: string) => console.log('Server:', message),
        error: (message: string, error?: unknown) => console.error('Server:', message, error),
        debug: (message: string) => console.log('Server:', message)
      }

      const {
        getSocketId,
        setSocketSubscription,
        cleanup,
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

          setupProjectHandlers(socket, ctx, io)
          
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
            const response = await fetch('/api/tree/killActiveSockets', {
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
            const response = await fetch('/api/tree/killActiveSockets', {
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