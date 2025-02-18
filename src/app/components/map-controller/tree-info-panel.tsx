import { cn } from '@/lib/utils'
import { capitalize } from '@/lib/str'
import type { Project, ProjectGroup } from '@/hooks/use-tree-sockets'
import { useUser } from '@clerk/nextjs'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import { useToast } from '../toast'

interface ProjectInfoPanelProps {
  project?: Project
  group?: ProjectGroup
  position: { x: number; y: number }
  isVisible: boolean
}

export const ProjectInfoPanel = ({ project, group, position, isVisible }: ProjectInfoPanelProps) => {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isNavigating, setIsNavigating] = useState(false)
  const { user } = useUser()
  const isAdmin = user?.organizationMemberships?.some(
    (membership) => membership.role === "org:admin"
  )
  const { show } = useToast()
  const isProjectsRoute = pathname === '/projects'
  
  // Reset navigation state when pathname or search params change
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (timeout.current) {
      clearTimeout(timeout.current)
      timeout.current = null
    }
    setIsNavigating(false)
  }, [pathname, searchParams])

  // Don't render the panel if not on the projects route
  if (!isProjectsRoute) return null

  const formattedDate = project?._meta_created_at ? new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(project._meta_created_at) : null

  const handleEdit = () => {
    if (!project) return
    setIsNavigating(true)
    router.push(`/projects/${project.id}?lat=${project._loc_lat}&lng=${project._loc_lng}`)

    /** Timeout in case of SSR issues */
    timeout.current = setTimeout(() => {
      show({
        message: 'There was an issue loading this project\'s details. Please try again.',
        type: 'error',
      })
      setIsNavigating(false)
    }, 5000)
  }

  return (
    <div 
      data-loading={isNavigating ? "true" : "false"}
      className={cn(
        "tree-info-panel frosted-glass",
        isVisible && "visible",
        "text-zinc-800 dark:text-zinc-50",
        (isAdmin || (project?.status === 'active')) && "cursor-pointer hover:scale-[1.02] active:scale-[0.98]",
        isNavigating && ["navigating"]
      )}
      style={{ 
        position: 'absolute',
        left: position.x,
        top: position.y - 8,
        transform: `translate(-50%, calc(-100% - 48px))`,
      }}
      onClick={() => {
        if (isAdmin || project?.status === 'active') {
          handleEdit()
        }
      }}
    >
      <div className="flex items-center justify-between">
        {group ? (
          <div className="tree-status bg-emerald-100 text-emerald-800">
            <i className="fa-solid fa-layer-group" />
            {group.count} trees
          </div>
        ) : project && (
          <>
            <div className={cn(
              "tree-status",
              project.status
            )}>
              <i className={cn(
                "fa-solid",
                {
                  'fa-seedling': project.status === 'draft',
                  'fa-tree': project.status === 'active',
                  'fa-archive': project.status === 'archived',
                  'fa-coins': project.status === 'funded',
                  'fa-check-circle': project.status === 'completed'
                }
              )} />
              {capitalize(project.status)}
            </div>
            {isAdmin && (
              <div
                className={cn(
                  "text-zinc-500 dark:text-zinc-400",
                  "w-6 h-6 flex items-center justify-center"
                )}
                aria-hidden="true"
              >
                {isNavigating ? (
                  <i className="fa-solid fa-circle-notch fa-spin text-sm" />
                ) : project.status === 'active' ? (
                  <i className="fa-solid fa-chevron-right text-sm" />
                ) : (
                  <i className="fa-solid fa-pencil text-sm" />
                )}
              </div>
            )}
          </>
        )}
      </div>
      <div className="tree-name">
        {group ? (
          [group.city, group.state].filter(Boolean).join(', ') || 'Unknown Location'
        ) : (
          project?.name || 'New project'
        )}
      </div>
      {project && (
        <div className="project-meta">Started {formattedDate}</div>
      )}
    </div>
  )
} 