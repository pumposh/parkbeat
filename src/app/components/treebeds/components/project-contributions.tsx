"use client"

import { useState, useRef, useEffect, useMemo } from 'react'
import { useProjectData } from '@/hooks/use-tree-sockets'
import { cn, formatDistanceToNow } from '@/lib/utils'
import { ContributionDialog } from './contribution-dialog'
import { ContributionType, ProjectContribution } from '@/server/types/shared'
import { UserAvatar } from '@/app/components/ui/user-avatar'
import { UserName } from '@/app/components/ui/user-name'
import { calculateProjectCosts } from '@/lib/cost'

interface ProjectContributionsProps {
  projectId: string
}

// Time window in milliseconds to group messages from the same user (5 minutes)
const GROUP_TIME_WINDOW = 5 * 60 * 1000

// Interface for grouped contributions
interface GroupedContribution {
  userId: string
  contributions: ProjectContribution[]
  timestamp: number
}

// Helper function to check if project target has been met
function isProjectTargetMet(currentAmount: number, targetAmount: number): boolean {
  // Consider the target met if we've reached at least 100% of the goal
  return currentAmount >= targetAmount;
}

export function ProjectContributions({ projectId }: ProjectContributionsProps) {
  const { projectData } = useProjectData(projectId)
  const [dialogOpen, setDialogOpen] = useState(false)
  const contributionsEndRef = useRef<HTMLDivElement>(null)
  
  const contributionSummary = projectData?.data?.contribution_summary
  const rawContributions = contributionSummary?.recent_contributions || []
  const totalAmount = contributionSummary?.total_amount_cents || 0
  const contributorCount = parseInt(`${contributionSummary?.contributor_count || '0'}`)
  
  // Get project cost breakdown and calculate target amount
  const costBreakdown = projectData?.data?.project?.cost_breakdown
  const costs = costBreakdown ? calculateProjectCosts(costBreakdown) : null
  const targetAmount = costs?.total || 0
  
  // Check if target has been met
  const targetMet = isProjectTargetMet(totalAmount / 100, targetAmount)
  
  // Group contributions by sender and recency
  const groupedContributions = useMemo(() => {
    // Sort contributions by date (oldest first)
    const sortedContributions = [...rawContributions].sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    
    const groups: GroupedContribution[] = [];
    
    sortedContributions.forEach(contribution => {
      const timestamp = new Date(contribution.created_at).getTime();
      const lastGroup = groups[groups.length - 1];
      
      // Check if we should add to the last group (same user and within time window)
      if (
        lastGroup && 
        lastGroup.userId === contribution.user_id && 
        timestamp - lastGroup.timestamp < GROUP_TIME_WINDOW
      ) {
        lastGroup.contributions.push(contribution);
        // Update the group timestamp to the latest message
        lastGroup.timestamp = timestamp;
      } else {
        // Create a new group
        groups.push({
          userId: contribution.user_id,
          contributions: [contribution],
          timestamp: timestamp
        });
      }
    });
    
    return groups;
  }, [rawContributions]);
  
  // Scroll to bottom when contributions change
  useEffect(() => {
    if (contributionsEndRef.current) {
      contributionsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [groupedContributions])
  
  const handleContributionSuccess = () => {
    // Dialog will close itself on success
  }
  
  const isLoading = !projectData?.data
  
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div className="animate-pulse bg-gray-200 h-6 w-1/2 rounded"></div>
          <div className="animate-pulse bg-gray-200 h-10 w-32 rounded"></div>
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse flex items-start gap-4">
              <div className="bg-gray-200 h-10 w-10 rounded-full"></div>
              <div className="flex-1 space-y-2">
                <div className="bg-gray-200 h-4 w-1/4 rounded"></div>
                <div className="bg-gray-200 h-3 w-3/4 rounded"></div>
                <div className="bg-gray-200 h-3 w-1/2 rounded"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }
  
  return (
    <>
      <div className="space-y-0 relative flex flex-col flex-grow overflow-y-auto pb-4">
      
      {/* Contribution Feed - with fixed height and scrolling */}
      <div className="mt-4">
        {groupedContributions.length > 0 ? (
          <div className="space-y-6 overflow-y-auto pr-2">
            {groupedContributions.map((group, index) => (
              <ContributionGroup 
                key={`${group.userId}-${group.timestamp}`} 
                group={group} 
              />
            ))}
            {/* Invisible element to scroll to */}
            <div ref={contributionsEndRef} />
          </div>
        ) : (
          <div className="text-center py-8 border border-dashed dark:border-gray-500 rounded-lg">
            <div className="text-4xl mb-2 text-gray-400">
              <i className="fa-solid fa-comments"></i>
            </div>
            <p className="text-muted-foreground font-display tracking-wide">No contributions yet</p>
          </div>
        )}
      </div>
      {/* Contribution Dialog */}
      <ContributionDialog 
        projectId={projectId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={handleContributionSuccess}
      />

    </div>
      <button 
        className={cn(
          "absolute bottom-3 left-3 right-3 inline-flex items-center justify-center rounded-lg text-sm font-medium transition-all h-12 px-6",
          targetMet 
            ? "frosted-glass text-gray-800 dark:text-white border border-white/20 shadow-sm" 
            : "bg-emerald-500 hover:bg-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 text-white"
        )}
        onClick={() => setDialogOpen(true)}
      >
        {targetMet ? (
          <>
            <i className="fa-solid fa-comment-dots mr-2"></i> Send a message
          </>
        ) : (
          <>
            <i className="fa-solid fa-rocket mr-2"></i> Contribute to this project
          </>
        )}
      </button>
    </>
  )
}

function ContributionGroup({ group }: { group: GroupedContribution }) {
  const { userId, contributions } = group;
  const latestDate = new Date(contributions[contributions.length - 1]?.created_at || '');
  const [formattedDate, setFormattedDate] = useState(formatDistanceToNow(latestDate, { addSuffix: true }));
  
  // Update the time display every minute
  useEffect(() => {
    // Initial update
    setFormattedDate(formatDistanceToNow(latestDate, { addSuffix: true }));
    
    // Set up interval to update the time every minute
    const intervalId = setInterval(() => {
      setFormattedDate(formatDistanceToNow(latestDate, { addSuffix: true }));
    }, 60000); // Update every minute (60000ms)
    
    // Clean up interval on unmount
    return () => clearInterval(intervalId);
  }, [latestDate]);
  
  // Calculate total financial contribution in this group
  const totalFinancial = contributions
    .filter(c => c.contribution_type === 'funding' && c.amount_cents)
    .reduce((sum, c) => sum + (c.amount_cents || 0), 0);
  
  return (
    <div className="flex items-start gap-4 p-4 rounded-lg bg-card border-border hover:bg-accent/5 transition-colors">
      <UserAvatar userId={userId} size={30} />
      <div className="flex-1">
        <div className="flex justify-between items-start">
          <div className="font-medium flex items-center">
            <UserName userId={userId} className="mr-2" />
            {totalFinancial > 0 && (
              <span className="ml-0 text-xs px-0 py-0.5 rounded-full bg-primary/10 text-primary">
                <i className="fa-solid fa-hand-holding-dollar mr-1 opacity-50"></i>
              </span>
            )}
            {contributions.some(c => c.contribution_type === 'social') && (
              <span className="ml-0 text-xs px-0 py-0.5 rounded-full bg-primary/10 text-primary">
                <i className="fa-solid fa-comment mr-1 opacity-50"></i>
              </span>
            )}
          </div>
          {totalFinancial > 0 && (
            <div className="font-medium text-green-600 dark:text-green-400">${(totalFinancial / 100).toFixed(2)}</div>
          )}
        </div>
        
        <div className="space-y-2 mt-2">
          {contributions.map((contribution) => (
            <div key={contribution.id} className="text-sm text-foreground">
              {contribution.message && (
                <p className="text-foreground">{contribution.message}</p>
              )}
              {!contribution.message && contribution.contribution_type === 'funding' && (
                <p className="text-muted-foreground italic">
                  Contributed ${(contribution.amount_cents! / 100).toFixed(2)}
                </p>
              )}
            </div>
          ))}
        </div>
        
        <div className="text-xs text-muted-foreground mt-2">
          {formattedDate}
        </div>
      </div>
    </div>
  )
} 