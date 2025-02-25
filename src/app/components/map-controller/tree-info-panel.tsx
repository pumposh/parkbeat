import { cn } from '@/lib/utils'
import { capitalize } from '@/lib/str'
import type { Project, ProjectGroup } from '@/hooks/use-tree-sockets'
import { useUser } from '@clerk/nextjs'
import { useRouter, usePathname } from 'next/navigation'
import { useNavigationState } from '@/hooks/use-nav-state'
import { UserAvatar } from '@/app/components/ui/user-avatar'
import { Suspense } from 'react'

interface ProjectInfoPanelProps {
  project?: Project
  group?: ProjectGroup
  position: { x: number; y: number }
  isVisible: boolean
  className?: string
}

// Simple avatar placeholder component
function AvatarPlaceholder({ size = 24 }: { size?: number }) {
  return (
    <div 
      className="rounded-full bg-gray-200 animate-pulse ring-3 ring-white dark:ring-zinc-800"
      style={{ width: size, height: size }}
    />
  );
}

export const ProjectInfoPanel = ({ project, group, position, isVisible, className }: ProjectInfoPanelProps) => {
  const router = useRouter()
  const pathname = usePathname()
  const [isNavigating, startNavigating] = useNavigationState()
  const { user } = useUser()
  const isAdmin = user?.organizationMemberships?.some(
    (membership) => membership.role === "org:admin"
  )
  const isProjectsRoute = pathname.includes('/projects')
  
  // Don't render the panel if not on the projects route

  const formattedDate = project?._meta_created_at ? new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(project._meta_created_at) : null

  const handleEdit = () => {
    if (!project) return
    startNavigating()
    router.push(`/projects/${project.id}?lat=${project._loc_lat}&lng=${project._loc_lng}`)
  }

  return (
    <div 
      data-loading={isNavigating ? "true" : "false"}
      className={cn(
        "tree-info-panel frosted-glass",
        className,
        isProjectsRoute && isVisible && "visible",
        "text-zinc-800 dark:text-zinc-50",
        (isAdmin || (project?.status === 'active')) && "cursor-pointer hover:scale-[1.02] active:scale-[0.98]",
        isNavigating && ["navigating"]
      )}
      style={{ 
        position: 'absolute',
        left: position.x,
        top: position.y - 8,
        transform: `translate(-50%, calc(-100% - 48px))`,
        width: '280px', // Widening the panel
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
            
            {/* Profile picture placed inline with status pill */}
            {project._meta_created_by && (
              <div className="flex items-center">
                <div className="opacity-100 bg-transparent isolate">
                  <Suspense fallback={<AvatarPlaceholder size={24} />}>
                    <UserAvatar 
                      userId={project._meta_created_by} 
                      size={24}
                    />
                  </Suspense>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      
      <div className="flex items-center justify-between">
        <div className="tree-name">
          {group ? (
            [group.city, group.state].filter(Boolean).join(', ') || 'Unknown Location'
          ) : (
            project?.name || 'New project'
          )}
        </div>
        
        {/* Chevron moved inline with title */}
        {isAdmin && project && (
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
      </div>
      
      {project && (
        <div className="project-meta mt-1">
          Started {formattedDate}
        </div>
      )}
    </div>
  )
}