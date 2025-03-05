'use client'

import { cn } from "@/lib/utils"
import { Logo } from "./ui/logo"
import { WelcomeGuide } from "./welcome/welcome"

export const PostsContent = ({ children }: { children: React.ReactNode }) => {
  if (!children) return null

  return (
    <main className="p-4 pb-2">
      <div className="relative max-w-2xl mx-auto">
        <div className="pointer-events-auto">
          <div className="flex flex-col items-center justify-center gap-6 overflow-visible">
            <WelcomeGuide allowSkip={false} />
          </div>
        </div>
      </div>
    </main>
  )
}