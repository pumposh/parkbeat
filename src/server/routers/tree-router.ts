import { Env as JStackEnv } from "@/server/jstack";
import { projects } from "@/server/db/schema"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { j, publicProcedure } from "../jstack"
import { getTreeHelpers } from "./tree-helpers/context"
import { projectClientEvents, projectServerEvents, setupProjectHandlers } from "./socket/project-handlers"
import { setupAIHandlers, aiClientEvents, aiServerEvents } from "./socket/ai-handlers"
import { Procedure } from "jstack"
import type { ProjectStatus } from "@/server/types/shared"

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
  pong: z.function().args(z.void()).returns(z.void()),
  ...projectClientEvents,
  ...aiClientEvents
})

/** Server sends to client */
const serverEvents = z.object({
  heartbeat: z.object({
    lastPingTime: z.number(),
    room: z.string()
  }),
  ping: z.undefined(),
  pong: z.function().args(z.void()).returns(z.void()),
  provideSocketId: z.string().optional(),
  ...projectServerEvents,
  ...aiServerEvents
})

type ProcedureContext = Parameters<Parameters<typeof publicProcedure.ws>[0]>[0]['ctx']
export type ServerProcedure = Procedure<JStackEnv, ProcedureContext, void, typeof clientEvents, typeof serverEvents>

// export type ProjectData = z.infer<typeof serverEvents>['projectData']['data']
export type ClientEvents = z.infer<typeof clientEvents>
export type ServerEvents = z.infer<typeof serverEvents>

export const treeRouter = j.router({
  killActiveSockets: publicProcedure
    .input(killActiveSocketsSchema)
    .post(async ({ ctx, input }) => {
      const { socketId } = input
      const { logger } = ctx
      logger.info(`[Process ${process.pid}] Killing socket ${socketId}`)
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
    .ws(({ io, ctx, c }) => {
      // Use the logger from the context provided by the middleware
      let logger = ctx.logger.group('socket', 'Generic Socket', true)

      const {
        getSocketId,
        enqueueSubscriptionCleanup,
        processCleanupQueue
      } = getTreeHelpers({ ctx, logger })

      let socketId: string | null = null


      return {
        onConnect({ socket }) {
          if (socketId || getSocketId(socket, true)) {
            console.log(`[Process ${process.pid}] Socket ${socketId} already connected`)
            return
          }
          socketId = getSocketId(socket)
          logger = ctx.logger.group(`socket_${socketId}`, `Socket ${socketId}`, true)

          console.log('Client connected to tree updates')

          logger.info('Client connected to tree updates')

          // Process any outstanding cleanup tasks
          processCleanupQueue().catch(error => {
            logger.error(`[Process ${process.pid}] Error processing cleanup queue on connect:`, error)
          })

          setupProjectHandlers(socket, ctx, io, c, logger)
          setupAIHandlers(socket, ctx, io, c, logger)
          
          // Send initial message to confirm connection
          logger.debug('Sending connection confirmation message')
          socket.on('onHeartbeat' as any, ({
            lastPingTime,
            room
          }) => {
            const timeSinceLastPing = (Date.now() - lastPingTime) / 1000
            logger.info(`heartbeat received from ${room} - ${timeSinceLastPing} seconds since last ping`)
            socket.emit('heartbeat', {
              lastPingTime: Date.now(),
              room
            })
          });
          socket.emit('provideSocketId', socketId ?? undefined)

          // Return cleanup function
          socketId = getSocketId(socket)

          return () => {
            if (!socketId) return
            enqueueSubscriptionCleanup(c, socketId, ['geohash', 'project'])
          }
        },
        onDisconnect: ({ socket }) => {
          logger.info(`[Process ${process.pid}] WebSocket connection closed`)
          socketId = getSocketId(socket)
          if (!socketId) return;
          
          // Queue for cleanup without waiting
          enqueueSubscriptionCleanup(c, socketId, ['geohash', 'project'])
        },
        onError: ({ error, socket }) => {
          logger.info(`[Process ${process.pid}] WebSocket connection closed: error=${error}`)
          socket.close();
          socketId = getSocketId(socket)
          if (!socketId) return;
          
          // Queue for cleanup without waiting
          enqueueSubscriptionCleanup(c, socketId, ['geohash', 'project'])
        },
      }
    })
}) 