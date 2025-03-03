import { cn } from '@/lib/utils'
import { capitalize } from '@/lib/str'
import type { Project, ProjectGroup, ContributionSummary } from '@/hooks/use-tree-sockets'
import { useUser } from '@clerk/nextjs'
import { useRouter, usePathname } from 'next/navigation'
import { useNavigationState } from '@/hooks/use-nav-state'
import { UserAvatar } from '@/app/components/ui/user-avatar'
import { Suspense } from 'react'
import { calculateProjectCosts, formatCurrency } from '@/lib/cost'

interface ProjectInfoPanelProps {
  project?: Project
  group?: ProjectGroup
  position: { x: number; y: number }
  isVisible: boolean
  className?: string
  contributionSummary?: ContributionSummary
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

// Mini progress bar component for the info panel
function MiniProgressBar({ percentage }: { percentage: number }) {
  // Determine color based on percentage
  const getColorClass = () => {
    if (percentage < 25) return 'bg-gray-500'
    if (percentage < 50) return 'bg-orange-800'
    if (percentage < 75) return 'bg-orange-500'
    if (percentage < 100) return 'bg-yellow-500'
    return 'bg-green-500'
  }
  
  return (
    <div className="w-full mt-1">
      <div className="h-1.5 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div 
          className={cn("h-full transition-all duration-500 ease-in-out", getColorClass())}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
    </div>
  );
}

export const ProjectInfoPanel = ({ project, group, position, isVisible, className, contributionSummary }: ProjectInfoPanelProps) => {
  const router = useRouter()
  const pathname = usePathname()
  const [isNavigating, startNavigating] = useNavigationState()
  const { user } = useUser()
  const isAdmin = user?.organizationMemberships?.some(
    (membership) => membership.role === "org:admin"
  )
  const isProjectsRoute = pathname.includes('/projects')
  
  // Calculate funding progress if project has cost breakdown and contributions
  const fundingData = project?.cost_breakdown && contributionSummary ? (() => {
    const costs = calculateProjectCosts(project.cost_breakdown);
    const totalAmount = contributionSummary.total_amount_cents / 100;
    const percentage = (costs?.total ?? 0) > 0 ? Math.round((totalAmount / (costs?.total ?? 0)) * 100) : 0;
    return {
      currentAmount: totalAmount,
      targetAmount: costs?.total ?? 0,
      percentage,
      contributorCount: contributionSummary.contributor_count,
      topContributors: contributionSummary.top_contributors || []
    };
  })() : null;

  const formattedDate = project?._meta_created_at ? new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(project._meta_created_at) : null

  const handleNav = () => {
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
      onClick={() => handleNav()}
    >
      <div className="flex items-center justify-between">
        {group ? (
          <div className="tree-status bg-emerald-100 text-emerald-800">
            <i className="fa-solid fa-layer-group" />
            {group.count} trees
          </div>
        ) : project && (
          <>
            <div className="flex items-center gap-2">
              <div className={cn(
                "tree-status",
                project.status
              )}>
                <i className={cn(
                  "fa-solid",
                  {
                    'fa-seedling': project.status === 'draft',
                    'fa-money-bills': project.status === 'active',
                    'fa-tree': project.status === 'funded',
                    'fa-archive': project.status === 'archived',
                    'fa-check-circle': project.status === 'completed'
                  }
                )} />
                {capitalize(project.status)}
              </div>
              
              {formattedDate && (
                <div className="tree-status bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 text-xs">
                  <i className="fa-solid fa-calendar-days" />
                  {formattedDate}
                </div>
              )}
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
        {project && (
          <div
            className={cn(
              "text-zinc-500 dark:text-zinc-400",
              "w-6 h-6 flex items-center justify-center"
            )}
            aria-hidden="true"
          >
            {isNavigating ? (
              <i className="fa-solid fa-circle-notch fa-spin text-sm" />
            ) : project.status === 'draft' ? (
              <i className="fa-solid fa-pencil text-sm" />
            ) : (
              <i className="fa-solid fa-chevron-right text-sm" />
            )}
          </div>
        )}
      </div>
      
      {/* Funding progress for active projects */}
      {project?.status !== 'draft' && fundingData && (
        <div className="mt-2 text-xs">
          <div className="flex justify-between items-center">
            <span className="font-medium text-foreground">
              {fundingData.percentage >= 100 
                ? (fundingData.percentage <= 105 
                  ? <span className="text-green-600 dark:text-green-400">Funded<i className="fa-solid ml-1 fa-check-circle"></i></span>
                  : <span className="text-amber-600 dark:text-amber-400">{formatCurrency(fundingData.currentAmount - fundingData.targetAmount)} extra <i className="fa-solid fa-fire"></i></span>
                )
                : <>{formatCurrency(fundingData.targetAmount - fundingData.currentAmount)} to go!</>
              }
            </span>
            <span className="text-muted-foreground">
              {fundingData.percentage}% of {formatCurrency(fundingData.targetAmount)}
            </span>
          </div>
          <MiniProgressBar percentage={fundingData.percentage} />
          <div className="mt-3 text-muted-foreground flex items-center justify-between">
            {fundingData.contributorCount > 0 ? (
              <div className="flex items-center justify-center h-full">
                <i className="fa-solid fa-users text-xs mr-1 opacity-70"></i>
                <span>{fundingData.contributorCount} supporter{fundingData.contributorCount !== 1 ? 's' : ''}</span>
              </div>
            ) : (
              <div className="flex items-center justify-between w-full h-full">
                <span className="bg-green-100 opacity-100 w-full text-center dark:bg-green-600 text-green-700 dark:text-white px-3 py-1 rounded-full">Be the first to support this project!</span>
              </div>
            )}
            
            {/* Top contributors */}
            {fundingData.topContributors.length > 0 && (
              <div className="flex items-center space-x-[-3px]">
                {fundingData.topContributors.map((contributor, index) => (
                  <div 
                    key={contributor.user_id} 
                    className="relative group" 
                    style={{ zIndex: 10 - index }}
                    title={`${formatCurrency(contributor.amount_cents / 100)} contributed`}
                  >
                    <Suspense fallback={<AvatarPlaceholder size={18} />}>
                      <UserAvatar 
                        userId={contributor.user_id} 
                        size={18}
                        className="ring-1 ring-white dark:ring-gray-800"
                      />
                    </Suspense>
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1 px-2 py-1 bg-black/80 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                      {formatCurrency(contributor.amount_cents / 100)}
                    </div>
                  </div>
                ))}
                
                {/* Show additional contributors count if there are more than shown */}
                {fundingData.contributorCount > fundingData.topContributors.length && (
                  <div 
                    className="relative group"
                    style={{ zIndex: 10 - fundingData.topContributors.length }}
                    title={`${fundingData.contributorCount - fundingData.topContributors.length} more contributors`}
                  >
                    <div className="flex items-center justify-center w-[22px] h-[22px] rounded-full bg-gray-200 dark:bg-gray-700 text-[10px] font-medium text-gray-700 dark:text-gray-300 ring-1 ring-white dark:ring-gray-800 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
                      +{fundingData.contributorCount - fundingData.topContributors.length}
                    </div>
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1 px-2 py-1 bg-black/80 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                      {fundingData.contributorCount - fundingData.topContributors.length} more contributor{fundingData.contributorCount - fundingData.topContributors.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}