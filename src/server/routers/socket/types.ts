import { ContextWithSuperJSON, Procedure } from "jstack"
import { Env as JStackEnv } from "@/server/jstack";
import { publicProcedure } from "../../jstack"
import type { ProjectData } from "@/server/types/shared"
import { ServerSocket } from "jstack-shared"
import { ParkbeatLogger } from "@/lib/logger"
import { z } from "zod"
import { projectEvents } from "./project-handlers"
import { aiEvents } from "./ai-handlers"

// Define base event types
export type ClientEvents = z.infer<typeof aiEvents.client> & z.infer<typeof projectEvents.client>
export type ServerEvents = z.infer<typeof aiEvents.server> & z.infer<typeof projectEvents.server>

// Create zod schemas for the event types to satisfy ZodTypeAny constraint
export const clientEventsSchema = z.object({
  ...aiEvents.client.shape,
  ...projectEvents.client.shape
})

export const serverEventsSchema = z.object({
  ...aiEvents.server.shape,
  ...projectEvents.server.shape
})

// Define procedure types using the zod schemas
type LocalProcedure = Procedure<JStackEnv, ProcedureContext, void, typeof clientEventsSchema, typeof serverEventsSchema>

export type ProcedureEnv = ContextWithSuperJSON<JStackEnv>
export type ProcedureContext = Parameters<Parameters<typeof publicProcedure.ws>[0]>[0]['ctx']

// Define IO types using the event schemas
export type AIIO = Parameters<Parameters<LocalProcedure["ws"]>[0]>[0]['io']
export type AISocket = ServerSocket<z.infer<typeof clientEventsSchema>, z.infer<typeof serverEventsSchema>>

export type Logger = ParkbeatLogger.GroupLogger | ParkbeatLogger.Logger | typeof console

export interface SocketHelpers {
  getSocketId: (socket: AISocket) => string
  setSocketSubscription: (socketId: string, geohash?: string) => Promise<number | undefined>
  removeSocketSubscription: (geohash: string, socketId: string) => Promise<number>
  cleanup: (socketId: string, subscriptions?: ('geohash' | 'project')[]) => Promise<void>
  getMostRecentSubscription: (socketId: string) => Promise<string | null>
  getActiveSubscribers: (geohash: string, excludeSocketIds?: string[]) => Promise<string[]>
  setProjectSubscription: (socketId: string, projectId: string) => Promise<number>
  removeProjectSubscription: (projectId: string, socketId: string) => Promise<number>
  getActiveProjectSubscribers: (projectId: string, excludeSocketIds?: string[]) => Promise<string[]>
  getProjectData: (projectId: string) => Promise<ProjectData | null>
  notifyProjectSubscribers: (projectId: string, socketId: string | null, io: AIIO) => Promise<void>
  enqueueSubscriptionCleanup: (c: ProcedureEnv, socketId: string, subscriptions?: ('geohash' | 'project')[]) => void
  processCleanupQueue: () => Promise<void>
} 