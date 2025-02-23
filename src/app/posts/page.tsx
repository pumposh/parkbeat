'use client'

import { Suspense } from "react"
import { PostsContent } from "../components/posts-content"

function PostsPageContent() {
  return (
    <PostsContent>
      <div>
        {/* Posts content will go here */}
      </div>
    </PostsContent>
  )
}

export default function PostsPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PostsPageContent />
    </Suspense>
  )
} 