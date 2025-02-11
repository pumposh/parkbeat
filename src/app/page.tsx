import { cn } from "@/lib/utils"
import { RecentPost } from "./components/post"
import { Header } from "./components/header"
import { MapController } from "./components/map-controller"
import Image from "next/image"

export default async function Home() {
  return (
    <>
      <MapController />
      <div className="relative pointer-events-none" style={{ zIndex: 'var(--z-content)' }}>
        <div className="pointer-events-auto">
          <Header />
        </div>
        <main className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center p-4">
          <div className="relative max-w-2xl w-full">
            <div className="pointer-events-auto">
              <div className="absolute -inset-[1px] bg-gradient-to-r from-zinc-300 via-zinc-200 to-zinc-300 dark:from-zinc-600 dark:via-zinc-500 dark:to-zinc-600 rounded-xl opacity-40" />
              <div className="frosted-glass rounded-xl p-8 relative">
                <div className="flex flex-col items-center justify-center gap-6">
                  <div className="relative w-24 h-24">
                    <Image
                      src="/parkbeat.png"
                      alt="Parkbeat Logo"
                      fill
                      className="object-contain brightness-110 dark:brightness-150"
                      priority
                    />
                  </div>
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
                    Share your thoughts in real-time.{" "}
                    <span className="inline sm:block">
                      Connect with the world, one beat at a time.
                    </span>
                  </p>

                  <RecentPost />
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </>
  )
}
