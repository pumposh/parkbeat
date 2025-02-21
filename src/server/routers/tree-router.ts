import { Env as JStackEnv } from "@/server/jstack";
import { projects } from "@/server/db/schema"
import { desc, eq, InferInsertModel, like } from "drizzle-orm"
import { z } from "zod"
import { j, publicProcedure } from "../jstack"
import { getTreeHelpers } from "./tree-helpers/context"
import { logger } from "@/lib/logger"
import { projectClientEvents, projectServerEvents, ProjectStatus, setupProjectHandlers } from "./socket/project-handlers"
import { setupAIHandlers, aiClientEvents, aiServerEvents } from "./socket/ai-handlers"
import { Procedure } from "jstack"
import { Redis } from "@upstash/redis/cloudflare";

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
  pong: z.function().args(z.void()).returns(z.void()),
  provideSocketId: z.string().optional(),
  ...projectServerEvents,
  ...aiServerEvents
})

type ProcedureContext = Parameters<Parameters<typeof publicProcedure.ws>[0]>[0]['ctx']
export type ServerProcedure = Procedure<JStackEnv, ProcedureContext, void, typeof clientEvents, typeof serverEvents>

export type ProjectData = z.infer<typeof serverEvents>['projectData']['data']
export type ClientEvents = z.infer<typeof clientEvents>
export type ServerEvents = z.infer<typeof serverEvents>

export const treeRouter = j.router({
  killActiveSockets: publicProcedure
    .input(killActiveSocketsSchema)
    .post(async ({ ctx, input }) => {
      const { socketId } = input
      logger.info(`\n\n[Process ${process.pid}] Killing socket ${socketId}`)
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
      const logger = {
        info: (...args: Parameters<typeof console.log>) => console.log('Server:', ...args),
        error: (...args: Parameters<typeof console.error>) => console.error('Server:', ...args),
        debug: (...args: Parameters<typeof console.debug>) => console.debug('Server:', ...args)
      }

      const {
        getSocketId,
        setSocketSubscription,
        cleanup,
        enqueueSubscriptionCleanup,
        processCleanupQueue
      } = getTreeHelpers({ ctx, logger })

      let socketId: string | null = null


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
        
        ping: () => {
          logger.debug('Keep alive received')
          if (!socketId) return
          setSocketSubscription(socketId)
        },

        onConnect({ socket }) {
          socketId = getSocketId(socket)
          logger.info('Client connected to tree updates')

          // Process any outstanding cleanup tasks
          processCleanupQueue().catch(error => {
            logger.error(`[Process ${process.pid}] Error processing cleanup queue on connect:`, error)
          })

          setupProjectHandlers(socket, ctx, io, c)
          setupAIHandlers(socket, ctx, io, c)
          
          // Send initial message to confirm connection
          logger.debug('Sending connection confirmation message')
          socket.on('onHeartbeat' as any, () => {
            logger.info('heartbeat received')
          });
          socket.emit('provideSocketId', socketId ?? undefined)

          // Return cleanup function
          socketId = getSocketId(socket)

          // queueSocketForCleanup('asdf')
          // logger.info('test fetch')
          // fetch( + '/api/tree/killActiveSockets', {
          //   method: 'POST',
          //   body: JSON.stringify({ socketId: 'asdfasdf' })
          // }).catch((error) => {
          //   logger.error('test fetch error', error)
          // }).finally(() => {
          //   logger.info('test fetch')
          // })

          return () => {
            if (!socketId) return
            enqueueSubscriptionCleanup(c, socketId)
          }
        },

        onDisconnect: ({ socket }) => {
          logger.info(`[Process ${process.pid}] WebSocket connection closed`)
          socketId = getSocketId(socket)
          if (!socketId) return;
          
          // Queue for cleanup without waiting
          enqueueSubscriptionCleanup(c, socketId)
        },
        onError: ({ error, socket }) => {
          logger.info(`[Process ${process.pid}] WebSocket connection closed: error=${error}`)
          socket.close();
          socketId = getSocketId(socket)
          if (!socketId) return;
          
          // Queue for cleanup without waiting
          enqueueSubscriptionCleanup(c, socketId)
        },
      }
    })
}) 