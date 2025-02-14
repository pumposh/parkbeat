import { j } from "./jstack"
import { postRouter } from "./routers/post-router"
import { cors } from "hono/cors"
import { treeRouter } from "./routers/tree-router"

/**
 * WebSocket Durable Object for handling real-time connections
 */
export class WebSocketDO {
  constructor(state: DurableObjectState, env: any) {}

  async fetch(request: Request) {
    return new Response("WebSocket DO")
  }
}

/**
 * This is your base API.
 * Here, you can handle errors, not-found responses, cors and more.
 *
 * @see https://jstack.app/docs/backend/app-router
 */
const api = j
  .router()
  .basePath("/api")
  .use(cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:8080",
      "http://192.168.1.226:3000",
      "http://192.168.1.226:8080",
    ],
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Upgrade-Insecure-Requests"],
    credentials: true,
  }))
  .onError(j.defaults.errorHandler)

/**
 * This is the main router for your server.
 * All routers in /server/routers should be added here manually.
 */
const appRouter = j.mergeRouters(api, {
  post: postRouter,
  tree: treeRouter,
})

export type AppRouter = typeof appRouter

export default appRouter
