import { ContextWithSuperJSON } from "jstack"
import { Env } from "../../jstack"
import { publicProcedure } from "../../jstack"
import { ServerSocket } from "@/lib/socket/socket"
import type { ProjectData } from "@/server/types/shared"


export type ProcedureEnv = ContextWithSuperJSON<Env>
export type ProcedureContext = Parameters<Parameters<typeof publicProcedure.ws>[0]>[0]['ctx']

export type AIIO = Parameters<Parameters<typeof publicProcedure.ws>[0]>[0]['io']
export type AISocket = ServerSocket<any, any>

export type Logger = {
  info: (...args: Parameters<typeof console.info>) => void
  error: (...args: Parameters<typeof console.error>) => void
  debug: (...args: Parameters<typeof console.debug>) => void
}

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