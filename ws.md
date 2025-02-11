---
title: WebSockets
summary: WebSockets in JStack
---

# WebSockets

WebSocket procedures enable **real-time bi-directional communication** between the client and server without the need to manage _any kind of infrastructure_ 🥳.

> **Important:** JStack's WebSocket implementation is designed specifically for Cloudflare Workers. This is because Cloudflare Workers allow [long-lived real-time connections](https://developers.cloudflare.com/workers/runtime-apis/websockets/) while Vercel and other Node.js runtime providers do not.

A WebSocket handler receives the following objects:

- `c`: [Hono context](https://hono.dev/docs/api/context), e.g. headers, request info, env variables
- `ctx`: Your context, e.g. database instance, authenticated user
- `io`: Connection manager for sending messages to clients

```ts {4}
import { j } from "../jstack"

export const postRouter = j.router({
  chat: j.procedure.ws(({ c, io, ctx }) => ({
    async onConnect({ socket }) {
      // ...
    },
  })),
})
```

---

## WebSockets Example

WebSockets are incredible for real-time features:

- Collaborative editing
- Real-time chat
- Live dashboard updates

**Example**: In the WebSocket router below, we implement a basic chat:

- Validate `incoming`/`outgoing` messages using the `chatValidator`
- Manage WebSocket connections and room-based message broadcasting

```ts server/routers/chat-router.ts /chatValidator/
import { z } from "zod"
import { j } from "jstack"

const chatValidator = z.object({
  message: z.object({
    roomId: z.string(),
    message: z.string(),
    author: z.string(),
  }),
})

export const chatRouter = j.router({
  chat: j.procedure
    .incoming(chatValidator)
    .outgoing(chatValidator)
    .ws(({ c, io, ctx }) => ({
      async onConnect({ socket }) {
        socket.on("message", async (message) => {
          // Optional: Implement message persistence
          // Example: await db.messages.create({ data: message })

          // Broadcast the message to all clients in the room
          await io.to(message.roomId).emit("message", message)
        })
      },
    })),
})
```

You can now listen to (and emit) real-time events on the client:

```tsx app/page.tsx {4,10,13-18,23-28}
"use client"

import { client } from "@/lib/client"
import { useWebSocket } from "jstack/client"

/**
 * Connect socket above component to avoid mixing
 * component & connection lifecycle
 */
const socket = client.post.chat.$ws()

export default function Page() {
  // 👇 Listening for incoming real-time events
  useWebSocket(socket, {
    message: ({ roomId, author, message }) => {
      console.log({ roomId, author, message })
    },
  })

  return (
    <button
      onClick={() => {
        // 👇 Send an event to the server
        socket.emit("message", {
          author: "John Doe",
          message: "Hello world",
          roomId: "general",
        })
      }}
    >
      Emit Chat Message
    </button>
  )
}
```

---

## WebSockets Setup

### Development

To make scalable, serverless WebSockets possible, JStack uses [Upstash Redis](https://upstash.com/) as its real-time engine. Deploying real-world, production WebSocket applications is possible without a credit card, entirely on their free tier.

_Side note: In the future, I'd like to add the ability to provide your own Redis connection string (e.g. self-hosted)._

1. After [logging into Upstash](https://upstash.com/), create a Redis database by clicking the _Create Database_ button

   <Frame>
     <Image src="/create-redis-db.png" alt="Create an Upstash Redis database" />
   </Frame>

2. Copy the `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` env variables into a `.dev.vars` file in the root of your app

   <Frame>
     <Image src="/copy-redis-env-variables.png" alt="Copy Upstash Redis environment variables" />
   </Frame>

   ```plaintext .dev.vars
    UPSTASH_REDIS_REST_URL=
    UPSTASH_REDIS_REST_TOKEN=
   ```

3. Start your Cloudflare backend using

   ```bash Terminal
   wrangler dev
   ```

4. Point the client `baseUrl` to the Cloudflare backend on port `8080`:

   ```ts {5-6}
   import type { AppRouter } from "@/server"
   import { createClient } from "jstack"

   export const client = createClient<AppRouter>({
     // 👇 Point to Cloudflare Worker API
     baseUrl: "http://localhost:8080/api",
   })
   ```

   **That's it! 🎉** You can now use WebSockets for your local development. See below for an examle usage.

---

### Deployment

1. Deploy your backend to Cloudflare Workers using [wrangler](https://developers.cloudflare.com/workers/wrangler/):

   ```bash Terminal
   wrangler deploy src/server/index.ts
   ```

   **Reason**: Serverless functions, such as those provided by Vercel, Netlify, or other serverless platforms, have a maximum execution limit and do not support long-lived connections. [Cloudflare workers do](https://developers.cloudflare.com/workers/runtime-apis/websockets/).

   The console output looks like this:

   <Frame>
     <Image src="/cf-deployment-url.png" alt="Deploy JStack WebSockets to Cloudflare" />
   </Frame>

2. Add the deployment URL to the client:

   ```ts lib/client.ts {5,8-16}
   import type { AppRouter } from "@/server"
   import { createClient } from "jstack"

   export const client = createClient<AppRouter>({
     baseUrl: `${getBaseUrl()}/api`,
   })

   function getBaseUrl() {
     // 👇 In production, use the production worker
     if (process.env.NODE_ENV === "production") {
       return "https://<YOUR_DEPLOYMENT>.workers.dev/api"
     }

     // 👇 Locally, use wrangler backend
     return `http://localhost:8080`
   }
   ```

   3. Set the `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` env variables in your Worker so it can access them:

   ```bash Terminal
    # Create UPSTASH_REDIS_REST_URL environment variable
    wrangler secret put UPSTASH_REDIS_REST_URL

    # Create UPSTASH_REDIS_REST_TOKEN environment variable
    wrangler secret put UPSTASH_REDIS_REST_TOKEN
   ```

   <Frame>
     <Image src="/wrangler-secret-put.png" alt="Use Wrangler to upload environment variables" />
   </Frame>

   **That's it! 🎉** If you now deploy your app to Vercel, Netlify, etc., the client will automatically connect to your production Cloudflare Worker.

   You can verify the connection by sending a request to:

   ```bash
    wss://<YOUR_DEPLOYMENT>.workers.dev/api/<ROUTER>/<PROCEDURE>
   ```

   <Frame>
     <Image src="/verify-ws-connection.png" alt="Verify your JStack WebSocket connection" />
   </Frame>