"use client"

import { useState, useRef, useEffect, useMemo } from 'react'
import { useProjectData } from '@/hooks/use-tree-sockets'
import { cn, formatDistanceToNow } from '@/lib/utils'
import { ContributionDialog } from './contribution-dialog'
import { ProjectContribution } from '@/server/types/shared'
import { UserAvatar } from '@/app/components/ui/user-avatar'
import { UserName } from '@/app/components/ui/user-name'
import { calculateProjectCosts } from '@/lib/cost'
import { useAuth } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'

interface ProjectContributionsProps {
  projectId: string
  isLoading?: boolean
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

export function ProjectContributions({ projectId, isLoading: externalIsLoading }: ProjectContributionsProps) {
  const { projectData } = useProjectData(projectId)
  const contributionsEndRef = useRef<HTMLDivElement>(null)
  const contributionSummary = projectData?.data?.contribution_summary
  const rawContributions = contributionSummary?.recent_contributions || []
  
  // Get project cost breakdown and calculate target amount
  const costBreakdown = projectData?.data?.project?.cost_breakdown
  const costs = costBreakdown ? calculateProjectCosts(costBreakdown) : null
  const targetAmount = costs?.total || 0
  
  // Group contributions by sender and recency
  const groupedContributions = useMemo(() => {
    // Sort contributions by date (newest first instead of oldest first)
    const sortedContributions = [...rawContributions].sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
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
  
  // Scroll to top when new contributions arrive
  useEffect(() => {
    // Only scroll if the ref exists
    if (!contributionsEndRef.current) return;
    
    // Scroll to the top since we're displaying newest messages at the bottom
    contributionsEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [groupedContributions]);
  
  const isLoading = externalIsLoading !== undefined ? externalIsLoading : !projectData?.data
  
  if (isLoading) {
    return (
      <div className="space-y-4 px-6 pt-6">
        <div className="space-y-8">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse flex items-start gap-4">
              <div className="bg-gray-200 dark:bg-black/20 h-10 w-10 rounded-full"></div>
              <div className="flex-1 space-y-2">
                <div className="bg-gray-200 dark:bg-black/20 h-4 w-1/4 rounded"></div>
                <div className="bg-gray-200 dark:bg-black/20 h-3 w-3/4 rounded"></div>
                <div className="bg-gray-200 dark:bg-black/20 h-3 w-1/2 rounded"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }
  
    return (
      <div className="mt-4">
        {groupedContributions.length > 0 ? (
          <div className="space-y-2 flex flex-col-reverse pt-2 pl-6 pr-4 pb-16">
            {/* Invisible element to scroll to (now at the top since we reversed the order) */}
            <div ref={contributionsEndRef} />
            {groupedContributions.map((group, index) => (
              <ContributionGroup 
                key={`${group.userId}-${group.timestamp}`} 
                group={group} 
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 border border-dashed dark:border-gray-500 rounded-lg">
            <div className="text-4xl mb-2 text-gray-400">
              <i className="fa-solid fa-comments"></i>
            </div>
            <p className="text-muted-foreground font-display tracking-wide">No contributions yet!</p>
            <p className="text-muted-foreground font-display opacity-50 text-sm">Be the first to contribute <i className="fa-solid fa-rocket"></i></p>
          </div>
        )}
      </div>
  )
}

export function ProjectContributionsDialog({ projectId }: { projectId: string }) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const { isSignedIn } = useAuth()
  const router = useRouter()
  const { projectData } = useProjectData(projectId)

  const handleContributionSuccess = () => {
    // Dialog will close itself on success
  } 
  const contributionSummary = projectData?.data?.contribution_summary

  const totalAmount = contributionSummary?.total_amount_cents || 0
  
  // Get project cost breakdown and calculate target amount
  const costBreakdown = projectData?.data?.project?.cost_breakdown
  
  const costs = costBreakdown ? calculateProjectCosts(costBreakdown) : null

  const targetAmount = costs?.total || 0

  // Check if target has been met
  const targetMet = isProjectTargetMet(totalAmount / 100, targetAmount)
  
  // Handle button click based on auth status
  const handleButtonClick = () => {
    if (isSignedIn) {
      setDialogOpen(true)
    } else {
      router.push('/sign-in')
    }
  }

  return (
    <>
      <ContributionDialog 
        projectId={projectId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={handleContributionSuccess}
        targetMet={targetMet}
      />
      <button 
        className={cn(
          "bottom-3 w-full inline-flex items-center justify-center rounded-2xl text-sm font-medium transition-all h-12 px-6",
          targetMet 
            ? "frosted-glass text-gray-800 dark:text-white border border-white/20 shadow-sm" 
            : "bg-emerald-500 hover:bg-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 text-white",
            dialogOpen ? "opacity-0" : ""
        )}
        onClick={handleButtonClick}
      >
        {!isSignedIn ? (
          <>
            <i className="fa-solid fa-user mr-2"></i> Sign up or sign in
          </>
        ) : targetMet ? (
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
  
  // Sort contributions within the group by date (newest first)
  const sortedContributions = [...contributions].sort((a, b) => 
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  
  const latestDate = new Date(sortedContributions[0]?.created_at || '');
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
    <div className="flex items-start gap-4 p-2 rounded-lg bg-card border-border hover:bg-accent/5 transition-colors">
      <UserAvatar userId={userId} size={30} />
      <div className="flex-1">
        <div className="flex justify-between items-start">
          <div className="font-medium flex items-center">
            <UserName userId={userId} className="mr-2" />
            {totalFinancial > 0 && (
              <span className="ml-0 text-xs px-0 py-0.5 rounded-full bg-primary/10 text-primary">
                <i className="fa-solid fa-money-bill-trend-up mr-1 opacity-50"></i>
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
          {sortedContributions.map((contribution) => (
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
        
        <div className="text-xs text-muted-foreground mt-2 opacity-50">
          {formattedDate}
        </div>
      </div>
    </div>
  )
} 