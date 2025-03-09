'use client'

import { Suspense } from "react"
import { PostsContent } from "@/app/components/posts-content"

function PostsPageContent() {
  return (
    <div className="frosted-glass p-4 m-4">
      <div className="flex flex-col items-center justify-center gap-4 py-8">
        <i className="fa-solid fa-bell text-4xl text-zinc-400" aria-hidden="true" />
        <h2 className="text-xl font-display font-medium text-zinc-600 dark:text-zinc-300">Coming Soon</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center">
          Updates and notifications will be available here soon.
        </p>
      </div>
    </div>
  )
}

export default function UpdatesPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PostsPageContent />
    </Suspense>
  )
} 