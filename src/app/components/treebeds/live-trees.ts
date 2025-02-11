"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { client } from "@/lib/client"
import { useWebSocket } from "jstack/client"
import { generateId } from "@/lib/id"
import type { TreeStatus } from "@/server/routers/tree-router"
import { useEffect, useRef } from "react"

// Define the tree type to match server schema
type Tree = {
  id: string
  name: string
  status: TreeStatus
  _loc_lat: number
  _loc_lng: number
  _meta_created_by: string
  _meta_updated_at: Date
  _meta_created_at: Date
}

// Subscribe to real-time updates
const ws = client.tree.live.$ws()

export const useLiveTrees = () => {
  const queryClient = useQueryClient()

  useWebSocket(ws, {
    newTree: (data: Tree) => {
      // Only handle actual tree updates
      if (data && typeof data === 'object' && 'id' in data) {
        console.log('Client: Received tree update:', data)
        if (data.id !== "0") { // Skip the connection confirmation message
          queryClient.setQueryData(["get-nearby-trees"], data)
        }
      }
    },
    ping: () => {
      console.log('Client: Ping received')
    },
    setTree: (data: Tree) => {
      console.log('Client: Received tree data:', data)
    },
    onConnect: () => {
      console.log('Client: Connected to WebSocket')
    },
    onError: (error: Error) => {
      console.error('Client: WebSocket error:', error)
    },
  })

  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastBounds = useRef<{
    top: number
    left: number
    bottom: number
    right: number
  } | null>(null)
  useEffect(() => {
    window.addEventListener('map:newBounds', (bounds: CustomEvent<{
      top: number
      left: number
      bottom: number
      right: number
    }>) => {
      if (timeout.current) {
        clearTimeout(timeout.current)
      }
      timeout.current = setTimeout(() => {
        if (lastBounds.current) {
          ws.emit('unsubscribe', {
            bounds: {
            north: lastBounds.current.top,
            south: lastBounds.current.bottom,
            east: lastBounds.current.right,
            west: lastBounds.current.left
          }
        })
      }
      lastBounds.current = {
        top: bounds.detail.top,
        left: bounds.detail.left,
        bottom: bounds.detail.bottom,
        right: bounds.detail.right
      }
      ws.emit('subscribe', {
        bounds: {
          north: lastBounds.current!.top,
          south: lastBounds.current!.bottom,
          east: lastBounds.current!.right,
          west: lastBounds.current!.left
        },
      })
      }, 200)
    })

    return () => {
      window.removeEventListener('map:newBounds', (bounds: CustomEvent<{
        top: number
        left: number
        bottom: number
        right: number 
      }>) => {
        console.log('Client: Removing bounds:', bounds)
        ws.emit('unsubscribe', {
          bounds: {
            north: bounds.detail.top,
            south: bounds.detail.bottom,
            east: bounds.detail.right,
            west: bounds.detail.left
          }
        })
      })
    };
  }, [])

  const { data: nearbyTrees, isPending: isLoadingTrees } = useQuery({
    queryKey: ["get-nearby-trees"],
    queryFn: async () => {
      return [];
    },
  })

  const { mutate: setTree, isPending } = useMutation({
    mutationFn: async ({
      name,
      lat,
      lng,
      status
    }: {
      name: string;
      lat: number;
      lng: number;
      status: TreeStatus;
    }) => {
      const id = generateId();
      const now = new Date();
      console.log("Client: Creating tree:", { name, lat, lng })
      try {
        // Emit the tree event with the correct data structure
        ws.emit('setTree', {
          id,
          name,
          status,
          _loc_lat: lat,
          _loc_lng: lng,
          _meta_created_by: "user", // TODO: Get actual user ID
          _meta_created_at: now,
          _meta_updated_at: now
        })
        return { name, lat, lng, status }
      } catch (error) {
        console.error('Client: Error creating tree:', error)
        throw error
      }
    },
    onSuccess: async (data) => {
      console.log("Client: Mutation succeeded with data:", data)
      // No need to invalidate query as we'll receive the update via WebSocket
    },
  })

  return {
    nearbyTrees,
    isLoadingTrees,
    setTree,
    isPending,
  }
}
