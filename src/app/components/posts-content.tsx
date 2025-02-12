'use client'

import { cn } from "@/lib/utils"
import { Logo } from "./ui/logo"

export const PostsContent = ({ children }: { children: React.ReactNode }) => {
  if (!children) return null

  return (
    <main className="p-4 pb-8">
      <div className="relative max-w-2xl mx-auto">
        <div className="pointer-events-auto">
          <div className="frosted-glass rounded-xl p-8 relative">
            <div className="flex flex-col items-center justify-center gap-6 overflow-visible">
              <Logo />
              <h1
                className={cn(
                  "inline-flex tracking-tight flex-col gap-1 transition text-center",
                  "font-display text-4xl sm:text-5xl md:text-6xl font-semibold leading-none lg:text-[4rem]",
                  "bg-gradient-to-r from-20% bg-clip-text text-transparent",
                  "from-zinc-800 to-zinc-600 dark:from-[#e5e9e4] dark:to-[#c7cdc6]"
                )}
              >
                <span>Parkbeat</span>
              </h1>

              <p className="text-zinc-600 dark:text-[#c7cdc6] text-lg/7 md:text-xl/8 text-pretty sm:text-wrap sm:text-center text-center max-w-xl">
                Stay connected with your community, {" "}
                <span className="inline sm:block">
                    one beat at a time.
                </span>
              </p>

              {children}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}