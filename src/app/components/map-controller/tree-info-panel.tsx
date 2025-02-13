import { cn } from '@/lib/utils'
import { capitalize } from '@/lib/str'
import type { Tree } from '@/hooks/use-tree-sockets'
import type { TreeGroup } from '@/lib/geo/threshGrouping'
import { useUser } from '@clerk/nextjs'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useState, useEffect } from 'react'

interface TreeInfoPanelProps {
  tree?: Tree
  group?: TreeGroup
  position: { x: number; y: number }
  isVisible: boolean
}

export const TreeInfoPanel = ({ tree, group, position, isVisible }: TreeInfoPanelProps) => {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isNavigating, setIsNavigating] = useState(false)
  const { user } = useUser()
  const isAdmin = user?.organizationMemberships?.some(
    (membership) => membership.role === "org:admin"
  )

  // Reset navigation state when pathname or search params change
  useEffect(() => {
    setIsNavigating(false)
  }, [pathname, searchParams])

  const formattedDate = tree?._meta_created_at ? new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(tree._meta_created_at) : null

  const handleEdit = () => {
    if (!tree) return
    setIsNavigating(true)
    router.push(`/manage-trees/${tree.id}?lat=${tree._loc_lat}&lng=${tree._loc_lng}`)
  }

  return (
    <div 
      className={cn(
        "tree-info-panel frosted-glass",
        isVisible && "visible",
        "text-zinc-800 dark:text-zinc-50"
      )}
      style={{ 
        position: 'absolute',
        left: position.x,
        top: position.y - 8,
        transform: `translate(-50%, calc(-100% - 48px))`,
      }}
    >
      <div className="flex items-center justify-between">
        {group ? (
          <div className="tree-status bg-emerald-100 text-emerald-800">
            <i className="fa-solid fa-layer-group" />
            {group.count} trees
          </div>
        ) : tree && (
          <>
            <div className={cn(
              "tree-status",
              tree.status
            )}>
              <i className={cn(
                "fa-solid",
                {
                  'fa-seedling': tree.status === 'draft',
                  'fa-tree': tree.status === 'live',
                  'fa-archive': tree.status === 'archived'
                }
              )} />
              {capitalize(tree.status)}
            </div>
            {isAdmin && (
              <button
                onClick={handleEdit}
                disabled={isNavigating}
                className={cn(
                  "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors",
                  "w-6 h-6 flex items-center justify-center",
                  isNavigating && "cursor-wait"
                )}
                aria-label="Edit tree"
              >
                {isNavigating ? (
                  <i className="fa-solid fa-circle-notch fa-spin text-sm" />
                ) : (
                  <i className="fa-solid fa-pencil text-sm" />
                )}
              </button>
            )}
          </>
        )}
      </div>
      <div className="tree-name">
        {group ? (
          [group.city, group.state].filter(Boolean).join(', ') || 'Unknown Location'
        ) : (
          tree?.name || 'New tree'
        )}
      </div>
      {tree && (
        <div className="tree-meta">Started {formattedDate}</div>
      )}
    </div>
  )
} 