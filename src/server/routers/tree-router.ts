import { trees, treeStatus } from "@/server/db/schema"
import { desc, eq, and, gte, lte } from "drizzle-orm"
import { z } from "zod"
import { j, publicProcedure } from "../jstack"

export type TreeStatus = typeof treeStatus.enumValues[number]

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
  message: z.object({
    id: z.string(),
    name: z.string(),
    status: z.enum(treeStatus.enumValues),
    _loc_lat: z.number(),
    _loc_lng: z.number(),
    _meta_created_by: z.string(),
    _meta_updated_at: z.date(),
    _meta_created_at: z.date(),
  }),
  setTree: z.object({
    id: z.string(),
    name: z.string(),
    status: z.enum(treeStatus.enumValues),
    _loc_lat: z.number(),
    _loc_lng: z.number(),
    _meta_created_by: z.string(),
    _meta_updated_at: z.date(),
    _meta_created_at: z.date(),
  }),
  subscribe: z.object({
    bounds: z.object({
      north: z.number(),
      south: z.number(),
      east: z.number(),
      west: z.number(),
    })
  })
})

export const treeRouter = j.router({
  // WebSocket procedure for real-time updates
  live: publicProcedure
    .incoming(wsEvents)
    .outgoing(wsEvents)
    .ws(({ io, ctx }) => {
      const handlers = {
        onMessage(data: Partial<Tree>) {
          console.log('Server: Received message:', data)
        },

        ping() {
          console.log('Server: Ping received')
        },

        async subscribe(data: { bounds: { north: number, south: number, east: number, west: number }}) {
          console.log('Server: Subscribing to area:', data.bounds)
          const { db } = ctx

          try {
            const nearbyTrees = await db
              .select()
              .from(trees)
              .where(
                and(
                  gte(trees._loc_lat, data.bounds.south.toString()),
                  lte(trees._loc_lat, data.bounds.north.toString()),
                  gte(trees._loc_lng, data.bounds.west.toString()),
                  lte(trees._loc_lng, data.bounds.east.toString())
                )
              )
              .orderBy(desc(trees._meta_created_at))

            // Send all trees in the area
            for (const tree of nearbyTrees) {
              await io.to('trees').emit('message', {
                ...tree,
                _loc_lat: parseFloat(tree._loc_lat),
                _loc_lng: parseFloat(tree._loc_lng)
              })
            }

            console.log('Server: Sent nearby trees:', nearbyTrees.length)
          } catch (error) {
            console.error('Server: Error fetching nearby trees:', error)
            throw error
          }
        },

        async setTree(data: Tree) {
          console.log('Server: Creating tree:', data)
          const { db } = ctx

          try {
            const insertData = {
              id: data.id,
              name: data.name,
              status: data.status,
              _loc_lat: data._loc_lat.toString(),
              _loc_lng: data._loc_lng.toString(),
              _meta_created_by: data._meta_created_by,
              _meta_updated_at: data._meta_updated_at,
              _meta_created_at: data._meta_created_at
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
              _loc_lng: parseFloat(result._loc_lng)
            }

            // Broadcast the new tree to all clients
            await io.to('trees').emit('message', treeToEmit)
            console.log('Server: Tree created and broadcast:', treeToEmit)

            return treeToEmit
          } catch (error) {
            console.error('Server: Error creating tree:', error)
            throw error
          }
        }
      }

      return {
        ...handlers,
        async onConnect({ socket }) {
          console.log('Server: Client connected to tree updates')
          
          // Join the trees room
          await socket.join('trees')
          
          // Send initial message to confirm connection
          await io.to('trees').emit('message', {
            id: '0',
            name: 'Connected to WebSocket',
            status: 'archived',
            _loc_lat: 0,
            _loc_lng: 0,
            _meta_created_by: 'system',
            _meta_created_at: new Date(),
            _meta_updated_at: new Date()
          })
        }
      }
    })
}) 