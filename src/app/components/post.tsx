"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { client } from "@/lib/client"
import { useWebSocket } from "jstack/client"
import { generateId } from "@/lib/id"

// Define the post type
type Post = {
  id: string
  name: string
  createdAt: Date
  updatedAt: Date
}

// Subscribe to real-time updates
// const ws = client.post.live.$ws()

export const RecentPost = () => {
  const [name, setName] = useState<string>("")
  const queryClient = useQueryClient()

  // useWebSocket(ws, {
  //   message: (data: Post) => {
  //     // Only handle actual post updates
  //     if (data && typeof data === 'object' && 'id' in data) {
  //       console.log('Client: Received post update:', data)
  //       if (data.id !== "0") { // Skip the connection confirmation message
  //         queryClient.setQueryData(["get-recent-post"], data)
  //       }
  //     }
  //   },
  //   ping: () => {
  //     console.log('Client: Ping received')
  //   },
  //   post: (data: { id: string; name: string }) => {
  //     console.log('Client: Received post name:', data.name)
  //   },
  //   onConnect: () => {
  //     console.log('Client: Connected to WebSocket')
  //   },
  //   onError: (error: Error) => {
  //     console.error('Client: WebSocket error:', error)
  //   },
  // })

  const { data: recentPost, isPending: isLoadingPosts } = useQuery({
    queryKey: ["get-recent-post"],
    queryFn: async () => {
      const res = await client.post.recent.$get()
      const data = await res.json()
      console.log('Client: Recent post data:', data)
      return data
    },
  })

  const { mutate: createPost, isPending } = useMutation({
    mutationFn: async ({ name }: { name: string }) => {
      console.log("Client: Creating post with name:", name)
      try {
        // Emit the post event and wait for response
        // ws?.emit('post', { id, name })
        // The actual post will be received through the message event handler
        return name
      } catch (error) {
        console.error('Client: Error creating post:', error)
        throw error
      }
    },
    onSuccess: async (data) => {
      console.log("Client: Mutation succeeded with data:", data)
      setName("")
      // No need to invalidate query as we'll receive the update via WebSocket
    },
  })

  return (
    <div className="w-full max-w-sm frosted-glass px-8 py-6 text-zinc-600 dark:text-zinc-100/90 space-y-2">
      {isLoadingPosts ? (
        <p className="text-zinc-500 dark:text-zinc-400 text-base/6">
          Loading your beats...
        </p>
      ) : recentPost ? (
        <p className="text-zinc-800 dark:text-zinc-400 text-base/6">
          Your latest beat: "{recentPost.name}"
        </p>
      ) : (
        <p className="text-zinc-500 dark:text-zinc-400 text-base/6">
          Drop your first beat!
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          createPost({ name })
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            createPost({ name })
          }
        }}
        className="flex flex-col gap-4"
      >
        <input
          type="text"
          placeholder="What's on your mind?"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full text-base/6 rounded-md frosted-glass hover:bg-white/75 dark:hover:bg-black/80 focus-visible:outline-none hover:ring-zinc-300 dark:hover:ring-zinc-700 focus:ring-zinc-300 dark:focus:ring-zinc-700 focus:bg-white/75 dark:focus:bg-black/80 transition h-12 px-4 py-2 text-zinc-800 dark:text-zinc-100"
        />
        <button
          disabled={isPending}
          type="submit"
          className="rounded-md text-base/6 frosted-glass focus-visible:outline-none focus-visible:ring-zinc-300 dark:focus-visible:ring-zinc-100 hover:ring-zinc-300 dark:hover:ring-zinc-100 h-12 px-10 py-3 text-zinc-800 dark:text-zinc-100 font-medium transition hover:bg-white/90 dark:hover:bg-black/60"
        >
          {isPending ? "Dropping beat..." : "Drop Beat"}
        </button>
      </form>
    </div>
  )
}
