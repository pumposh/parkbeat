'use client'

import { PlaceTreeForm } from "../components/treebeds/manage-trees-form"
import { useLiveTrees } from "../../hooks/use-tree-sockets"
import { cn } from "@/lib/utils"

export default function PlaceTreePage() {
  const { nearbyTrees, isLoadingTrees, setTree, isPending } = useLiveTrees()

  if (isLoadingTrees) {
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