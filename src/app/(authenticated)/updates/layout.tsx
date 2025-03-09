import { ReactNode } from "react"

export default function UpdatesLayout({ children }: { children: ReactNode }) {
  return (
    <div className="posts-layout">
      {children}
    </div>
  )
} 