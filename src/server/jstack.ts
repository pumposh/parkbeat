import { neon } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-http"
import { env } from "hono/adapter"
import { jstack, Procedure } from "jstack"
import { Redis } from "@upstash/redis/cloudflare"
import { getLoggerMiddleware } from "./middleware/logger-middleware"
import { R2Bucket } from "@cloudflare/workers-types"

export interface Env {
  Bindings: { 
    DATABASE_URL: string;
    UPSTASH_REDIS_REST_URL: string;
    UPSTASH_REDIS_REST_TOKEN: string;
    WEBSOCKET_DO: DurableObjectNamespace;
    R2: R2Bucket;
    STORAGE_DOMAIN: string;
  }
}

export const j = jstack.init<Env>()

export type JStack = typeof j

/**
 * Type-safely injects database into all procedures
 * 
 * @see https://jstack.app/docs/backend/middleware
 */
const databaseMiddleware = j.middleware(async ({ c, next }) => {
  const { DATABASE_URL } = env(c)

  const sql = neon(DATABASE_URL)
  const db = drizzle(sql)

  return await next({ db })
})

/**
 * Type-safely injects Redis client into all procedures
 */
const redisMiddleware = j.middleware(async ({ c, next }) => {
  const { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN } = env(c)

  const redis = new Redis({
    url: UPSTASH_REDIS_REST_URL,
    token: UPSTASH_REDIS_REST_TOKEN,
  })

  return await next({ redis })
})

const loggerMiddleware = getLoggerMiddleware(j);

// const authMiddleware = j.middleware(async ({ c, next }) => {
  
// })

/**
 * Public (unauthenticated) procedures
 *
 * This is the base piece you use to build new queries and mutations on your API.
 */
export const publicProcedure = j.procedure
  .use(loggerMiddleware)
  .use(databaseMiddleware)
  .use(redisMiddleware)

export type PublicProcedure<T extends Procedure<Env, any, any, any>> = T