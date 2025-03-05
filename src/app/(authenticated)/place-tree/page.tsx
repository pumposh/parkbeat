'use client'

import { PlaceTreeForm } from "@/app/components/treebeds/place-tree-form"
import { useLiveTrees } from "@/hooks/use-tree-sockets"
import { cn } from "@/lib/utils"
import { Suspense } from "react"

function PlaceTreeContent() {
  const { projectMap, setProject, isPending } = useLiveTrees()

  if (isPending) {
    return <div>Loading...</div>
  }

  return (
    <main className="p-4 pb-8">
      <div className="relative max-w-2xl mx-auto">
        <div className="pointer-events-auto">
          <div className="frosted-glass rounded-xl p-8 relative">
            <div className="flex flex-col gap-6">
              <div className="flex items-center gap-3">
                <i className="fa-solid fa-map-pin text-xl text-zinc-700 dark:text-zinc-300" aria-hidden="true" />
                <h1 className={cn(
                  "text-xl font-semibold",
                  "text-zinc-800 dark:text-zinc-200"
                )}>
                  Place a Tree Bed
                </h1>
              </div>
              <PlaceTreeForm />
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}

export default function PlaceTreePage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PlaceTreeContent />
    </Suspense>
  )
}