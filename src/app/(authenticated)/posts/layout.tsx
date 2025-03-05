import { ReactNode } from "react"

export default function PostsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="posts-layout">
      {children}
    </div>
  )
} 