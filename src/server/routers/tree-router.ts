import { trees } from "@/server/db/schema"
import { desc, like } from "drizzle-orm"
import { z } from "zod"
import { j, publicProcedure } from "../jstack"
import geohash from 'ngeohash'

export type TreeStatus = 'draft' | 'live' | 'archived'

// Define the tree type
type Tree = {
  id: string
  name: string
  status: TreeStatus
  ["_loc_lat"]: number
  ["_loc_lng"]: number
  ["_meta_created_by"]: string
  ["_meta_updated_at"]: Date
  ["_meta_created_at"]: Date
}

// Define the WebSocket event types
const wsEvents = z.object({
  ping: z.void(),
  pong: z.void(),
  newTree: z.object({
    id: z.string(),
    name: z.string(),
    status: z.enum(['draft', 'live', 'archived']),
    _loc_lat: z.number(),
    _loc_lng: z.number(),
    _meta_created_by: z.string(),
    _meta_updated_at: z.string(),
    _meta_created_at: z.string(),
  }),
  setTree: z.object({
    id: z.string(),
    name: z.string(),
    status: z.enum(['draft', 'live', 'archived']),
    _loc_lat: z.number(),
    _loc_lng: z.number(),
    _meta_created_by: z.string(),
    _meta_updated_at: z.string(),
    _meta_created_at: z.string(),
  }),
  subscribe: z.tuple([
    z.object({
      geohash: z.string().min(2, "Geohash must be at least 2 characters long"),
    }),
    z.array(z.object({
      id: z.string(),
      name: z.string(),
      status: z.enum(['draft', 'live', 'archived']),
      _loc_lat: z.number(),
      _loc_lng: z.number(),
      _loc_geohash: z.string(),
      _meta_created_by: z.string(),
      _meta_updated_at: z.string(),
      _meta_created_at: z.string(),
    }))
  ]),
  unsubscribe: z.object({
    geohash: z.string(),
  })
})

export const treeRouter = j.router({
  // WebSocket procedure for real-time updates
  live: publicProcedure
    .incoming(wsEvents)
    .outgoing(wsEvents)
    .ws(({ io, ctx }) => ({
      async onConnect({ socket }) {
        console.log('Server: Client connected to tree updates')
        
        // Send initial message to confirm connection
        await socket.emit('pong', undefined)

        // Handle subscribe
        socket.on('subscribe', async (data) => {
          console.log('Server: Subscribing to area:', data[0].geohash)
          const { db } = ctx

          try {
            // Join rooms for each geohash prefix
            await socket.join(`geohash:${data[0].geohash}`)

            const nearbyTrees = await db
              .select()
              .from(trees)
              .where(
                // Match geohash prefix
                like(trees._loc_geohash, `${data[0].geohash}%`)
              )
              .orderBy(desc(trees._meta_created_at))

            // Send all trees in the area through individual newTree events
            const treesToEmit = nearbyTrees.map((tree) => ({
              ...tree,
              _loc_lat: parseFloat(tree._loc_lat),
              _loc_lng: parseFloat(tree._loc_lng),
              status: tree.status as TreeStatus,
              _meta_updated_at: tree._meta_updated_at.toISOString(),
              _meta_created_at: tree._meta_created_at.toISOString()
            }))

            socket.emit('subscribe', [
              {
                geohash: data[0].geohash,
              },
              treesToEmit
            ])

            console.log('Server: Sent nearby trees:', nearbyTrees.length)
            return true
          } catch (error) {
            console.error('Server: Error fetching nearby trees:', error)
            throw error
          }
        })

        // Handle unsubscribe
        socket.on('unsubscribe', async (data: {
          geohash: string
        }) => {
          // Leave rooms for each geohash prefix
          await socket.leave(`geohash:${data.geohash}`)
        })

        // Handle ping
        socket.on('ping', () => {
          console.log('Server: Ping received')
        })

        socket.on('onConnect' as any, () => {
          console.log('Server: Client connected to tree updates')
        })

        socket.on('newTree', (data) => {
          console.log('Server: New tree:', data)
        })


        // Handle setTree
        socket.on('setTree', async (data) => {
          console.log('Server: Creating tree:', data)
          const { db } = ctx

          try {
            // Calculate geohash for the tree
            const hash = geohash.encode(data._loc_lat, data._loc_lng)

            const insertData = {
              id: data.id,
              name: data.name,
              status: data.status,
              _loc_lat: data._loc_lat.toString(),
              _loc_lng: data._loc_lng.toString(),
              _loc_geohash: hash,
              _meta_created_by: data._meta_created_by,
              _meta_updated_at: new Date(data._meta_updated_at),
              _meta_created_at: new Date(data._meta_created_at)
            } as const;

            const [result] = await db.insert(trees)
              .values(insertData)
              .returning();

            if (!result) {
              throw new Error('Failed to create tree')
            }

            // Convert the numeric ID to string before broadcasting
            const treeToEmit = {
              ...result,
              id: result.id,
              _loc_lat: parseFloat(result._loc_lat),
              _loc_lng: parseFloat(result._loc_lng),
              _meta_updated_at: result._meta_updated_at.toISOString(),
              _meta_created_at: result._meta_created_at.toISOString()
            }

            // Broadcast to all clients subscribed to this geohash prefix
            // We'll broadcast to all rooms that match the tree's geohash prefix
            // This ensures clients get updates for trees in their subscribed areas
            const treeHash = result._loc_geohash
            for (let i = 1; i <= treeHash.length; i++) {
              const prefix = treeHash.substring(0, i)
              const treeToEmitWithStatus = {
                ...treeToEmit,
                status: treeToEmit.status as TreeStatus
              }
              await io.to(`geohash:${prefix}`).emit('newTree', treeToEmitWithStatus)
            }

            console.log('Server: Tree created and broadcast to relevant clients')
          } catch (error) {
            console.error('Server: Error creating tree:', error)
            throw error
          }
        })
      }
    }))
}) 