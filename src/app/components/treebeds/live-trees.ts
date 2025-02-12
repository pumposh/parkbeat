"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { client } from "@/lib/client"
import { useWebSocket } from "jstack/client"
import { generateId } from "@/lib/id"
import type { TreeStatus } from "@/server/routers/tree-router"
import { useEffect, useRef, useState, useCallback } from "react"
import { boundsToGeohash } from "@/lib/geohash"
import { useAuth } from "@clerk/nextjs"

// Define base tree type
export type BaseTree = {
  id: string
  name: string
  status: TreeStatus
  _loc_lat: number
  _loc_lng: number
  _meta_created_by: string
}

// Client-side tree type with Date objects
export type Tree = BaseTree & {
  _meta_updated_at: Date
  _meta_created_at: Date
}

// WebSocket payload type with string dates
export type TreePayload = BaseTree & {
  _meta_updated_at: string
  _meta_created_at: string
}

// Spatial index interface for quick geographic lookups
interface SpatialIndex {
  geohash: string
  trees: Map<string, Tree>
}

// Subscribe to real-time updates
const ws = client.tree.live.$ws()

export const useLiveTrees = () => {
  // Main tree storage with O(1) lookup by ID
  const [treeMap, setTreeMap] = useState<Map<string, Tree>>(new Map())
  
  // Spatial index for quick geographic queries
  const [spatialIndices, setSpatialIndices] = useState<Map<string, SpatialIndex>>(new Map())
  
  const { userId } = useAuth()

  // Efficient tree update function
  const updateTree = useCallback((tree: Tree) => {
    setTreeMap(prev => {
      const next = new Map(prev)
      next.set(tree.id, tree)
      return next
    })

    // Update spatial index if needed
    setSpatialIndices(prev => {
      const next = new Map(prev)
      const geohash = boundsToGeohash({
        north: tree._loc_lat + 0.01,
        south: tree._loc_lat - 0.01,
        east: tree._loc_lng + 0.01,
        west: tree._loc_lng - 0.01
      })

      // Get or create spatial index for this geohash
      let index = next.get(geohash)
      if (!index) {
        index = { geohash, trees: new Map() }
        next.set(geohash, index)
      }

      // Update tree in spatial index
      index.trees.set(tree.id, tree)
      return next
    })
  }, [])

  // WebSocket event handlers
  useWebSocket(ws, {
    newTree: (data: TreePayload) => {
      if (data && typeof data === 'object' && 'id' in data) {
        console.log('Client: Received tree update:', data)
        if (data.id !== "0") {
          const processedTree: Tree = {
            ...data,
            _meta_updated_at: new Date(data._meta_updated_at),
            _meta_created_at: new Date(data._meta_created_at)
          }
          updateTree(processedTree)
        }
      }
    },
    setTree: (data: TreePayload) => {
      if (data && typeof data === 'object' && 'id' in data) {
        const processedTree: Tree = {
          ...data,
          _meta_updated_at: new Date(data._meta_updated_at),
          _meta_created_at: new Date(data._meta_created_at)
        }
        updateTree(processedTree)
      }
    },
    subscribe: ([{ geohash }, trees]: [{ geohash: string }, TreePayload[]]) => {
      console.log('Client: Processing subscription data for geohash:', geohash)
      if (Array.isArray(trees)) {
        const processedTrees = trees.map(tree => ({
          ...tree,
          _meta_updated_at: new Date(tree._meta_updated_at),
          _meta_created_at: new Date(tree._meta_created_at)
        }))

        // Batch update trees
        setTreeMap(prev => {
          const next = new Map(prev)
          processedTrees.forEach(tree => next.set(tree.id, tree))
          return next
        })

        // Update spatial index
        setSpatialIndices(prev => {
          const next = new Map(prev)
          const index = next.get(geohash) || { geohash, trees: new Map() }
          processedTrees.forEach(tree => index.trees.set(tree.id, tree))
          next.set(geohash, index)
          return next
        })
      }
    },
    ping: () => {},
    pong: () => {},
    onConnect: () => {
      console.log('Client: Connected to WebSocket')
    },
    onError: (error: Error) => {
      console.error('Client: WebSocket error:', error)
    }
  })

  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastGeohash = useRef<string | null>(null)

  // Subscription management
  useEffect(() => {
    const handleBoundsChange = ({ detail: bounds }: CustomEvent<{
      north: number
      south: number
      east: number
      west: number
    }>) => {
      if (timeout.current) {
        clearTimeout(timeout.current)
      }

      timeout.current = setTimeout(async () => {
        const geohash = boundsToGeohash(bounds)
        if (geohash.length < 2) {
          console.log('Client: Geohash too short, skipping subscription:', geohash)
          return
        }

        if (lastGeohash.current !== geohash) {
          if (lastGeohash.current) {
            await ws.emit('unsubscribe', { geohash: lastGeohash.current })
            console.log('Client: Unsubscribed from:', lastGeohash.current)
          }

          console.log('Client: Subscribing to:', geohash)
          lastGeohash.current = geohash
          await ws.emit('subscribe', [{ geohash }, []])
        }
      }, 500)
    }

    window.addEventListener('map:newBounds', handleBoundsChange as EventListener)
    return () => {
      window.removeEventListener('map:newBounds', handleBoundsChange as EventListener)
      if (lastGeohash.current) {
        ws.emit('unsubscribe', { geohash: lastGeohash.current })
      }
    }
  }, [])

  // Tree mutation handler
  const { mutate: setTree, isPending } = useMutation({
    mutationFn: async ({
      name,
      lat,
      lng,
      status
    }: {
      name: string
      lat: number
      lng: number
      status: TreeStatus
    }) => {
      const id = generateId()
      const now = new Date()
      console.log("Client: Creating tree:", { name, lat, lng })
      
      const treeData: TreePayload = {
        id,
        name,
        status,
        _loc_lat: lat,
        _loc_lng: lng,
        _meta_created_by: userId || "unknown",
        _meta_created_at: now.toISOString(),
        _meta_updated_at: now.toISOString()
      }
      
      await ws.emit('setTree', treeData)
      return { name, lat, lng, status }
    }
  })

  // Get trees for current view
  const getVisibleTrees = useCallback(() => {
    if (!lastGeohash.current) return []
    const index = spatialIndices.get(lastGeohash.current)
    return index ? Array.from(index.trees.values()) : []
  }, [spatialIndices])

  return {
    visibleTrees: getVisibleTrees(),
    allTrees: Array.from(treeMap.values()),
    setTree,
    isPending,
  }
}
