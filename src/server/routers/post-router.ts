import { posts } from "@/server/db/schema"
import { desc, eq } from "drizzle-orm"
import { z } from "zod"
import { j, publicProcedure } from "../jstack"

// Define the post type
type Post = {
  id: string
  name: string
  createdAt: Date
  updatedAt: Date
}

// Define the WebSocket event types
const wsEvents = z.object({
  ping: z.void(),
  message: z.object({
    id: z.string(),
    name: z.string(),
    createdAt: z.date(),
    updatedAt: z.date(),
  }),
  post: z.object({
    id: z.string(),
    name: z.string(),
  }),
})

export const postRouter = j.router({
  recent: publicProcedure.query(async ({ c, ctx }) => {
    const { db } = ctx

    try {
      const [recentPost] = await db
        .select()
        .from(posts)
        .orderBy(desc(posts.createdAt))
        .limit(1)

      console.log('Recent post from DB:', recentPost)
      return c.json(recentPost ?? null)
    } catch (error) {
      console.error('Error in recent query:', error)
      throw error
    }
  }),

  create: publicProcedure
    .input(z.object({ 
      id: z.string(),
      name: z.string().min(1) 
    }))
    .mutation(async ({ ctx, c, input }) => {
      const { id, name } = input
      const { db } = ctx

      try {
        console.log('Attempting to create post with name:', name, 'id:', id)
        
        // Insert the new post with client-provided ID
        const [result] = await db.insert(posts)
          .values({ id, name })
          .returning()
        console.log('Insert result:', result)

        // Return the created post
        return c.json(result)
      } catch (error) {
        console.error('Error in create mutation:', error)
        throw error
      }
    }),

  // WebSocket procedure for real-time updates
  live: publicProcedure
    .incoming(wsEvents)
    .outgoing(wsEvents)
    .ws(({ io, ctx }) => ({
      async onConnect({ socket }) {
        console.log('Server: Client connected to post updates')
        
        // Join the posts room
        await socket.join('posts')
        
        // Send initial message to confirm connection
        await io.to('posts').emit('message', {
          id: '0',
          name: 'Connected to WebSocket',
          createdAt: new Date(),
          updatedAt: new Date()
        })

        socket.on('ping', () => {
          console.log('Server: Ping received')
        })

        socket.on('message', (data: Partial<Post>) => {
          console.log('Server: Received message:', data)
        })

        // Register post event handler
        socket.on('post', async (data: { id: string; name: string }) => {
          console.log('Server: Creating post with name:', data.name)
          const { db } = ctx

          try {
            // Insert the new post with the provided ID
            const [result] = await db.insert(posts)
              .values({ 
                id: data.id,
                name: data.name,
              })
              .returning()

            if (!result) {
              throw new Error('Failed to create post')
            }

            // Convert the numeric ID to string before broadcasting
            const postToEmit = {
              ...result,
              id: result.id.toString()
            }

            // Broadcast the new post to all clients
            await io.to('posts').emit('message', postToEmit)
            console.log('Server: Post created and broadcast:', postToEmit)

            return postToEmit
          } catch (error) {
            console.error('Server: Error creating post:', error)
            throw error
          }
        })
      },
    })),
})
