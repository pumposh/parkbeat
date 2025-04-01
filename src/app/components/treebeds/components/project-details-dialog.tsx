'use client'

import { useState, useEffect, useMemo } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useRouter } from 'next/navigation'
import { ProjectDetails, ProjectDetailsSkeleton } from './project-details'
import { ProjectContributions, ProjectContributionsDialog, ProjectContributionsSkeleton } from './project-contributions'
import { ProjectShare, ProjectShareSkeleton } from './project-share'
import { useProjectData } from '@/hooks/use-tree-sockets'
import type { ProjectFormData } from '../tree-dialog'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { cn } from '@/lib/utils'
import { ProjectTargetTracker } from './project-target-tracker'
import { calculateProjectCosts } from '@/lib/cost'
import { CarouselTabs } from '../../ui/carousel-tabs'
import { ProjectSettings } from './project-settings'

interface ProjectDetailsContentProps {
  projectId: string
  onClose?: () => void
}

function ProjectDetailsContent({ projectId, onClose }: ProjectDetailsContentProps) {
  const { projectData, disconnect } = useProjectData(projectId)
  const [initialData, setInitialData] = useState<ProjectFormData | null>(null)
  
  // Determine if the component is in a loading state
  const isLoading = useMemo(() =>
    !initialData || initialData.id !== projectId,
  [initialData, projectId])

  // Update initialData when projectData changes
  useEffect(() => {
    if (projectData?.data) {
      console.log('[ProjectDetailsDialog] Received project data update:', projectData.data)
      const suggestion = projectData.data.suggestions?.find(s => s.id === projectData.data.project.source_suggestion_id)
      const category = projectData.data.project.category === 'other' ? suggestion?.category : projectData.data.project.category

      setInitialData({
        id: projectData.data.project.id,
        name: projectData.data.project.name,
        description: projectData.data.project.description || "",
        location: projectData.data.project._loc_lat && projectData.data.project._loc_lng
          ? {
              lat: projectData.data.project._loc_lat,
              lng: projectData.data.project._loc_lng
            }
          : null,
        viewParams: {
          heading: projectData.data.project._view_heading || 0,
          pitch: projectData.data.project._view_pitch || 0,
          zoom: projectData.data.project._view_zoom || 1
        },
        category: category,
        cost_breakdown: projectData.data.project.cost_breakdown,
        suggestion: suggestion,
        _meta_created_by: projectData.data.project._meta_created_by
      })
    }
  }, [projectData])

  // Cleanup function for disconnecting from socket
  useEffect(() => {
    return () => {
      disconnect()
    }
  }, [disconnect])

  // Render project title section
  const renderProjectTitle = () => {
    if (isLoading) {
      return (
        <div className="p-6 pb-0">
          <div className="animate-pulse bg-gray-200 dark:bg-black/20 h-8 w-3/4 rounded mb-4"></div>
          <div className="animate-pulse bg-gray-200 dark:bg-black/20 h-6 w-1/3 rounded mb-4"></div>
          <div className="animate-pulse bg-gray-200 dark:bg-black/20 h-4 w-1/4 rounded"></div>
        </div>
      );
    }
    
    if (!initialData) return null;
    
    const categoryEmojis: Record<string, string> = {
      urban_greening: '🌳',
      park_improvement: '🏞️',
      community_garden: '🌱',
      playground: '🎪',
      public_art: '🎨',
      sustainability: '♻️',
      accessibility: '♿️',
      other: '✨'
    };
    
    // Calculate project costs and current funding
    const costs = calculateProjectCosts(initialData.cost_breakdown);
    const totalCost = costs?.total || 0;
    const currentFunding = projectData?.data?.contribution_summary?.total_amount_cents || 0;
    
    return (
      <div className="p-6 pb-0">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 pr-8">
          {initialData.name}
        </h1>
        {initialData.category && (
          <div className="mt-2">
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-gray-100/50 dark:bg-black/10 text-gray-800 dark:text-gray-300">
              <span>{categoryEmojis[initialData.category] || '✨'}</span>
              <span className="uppercase tracking-wide font-display opacity-80">
                {initialData.category.replace(/_/g, ' ')}
              </span>
            </span>
          </div>
        )}
        
        {/* Project Target Tracker */}
        {totalCost > 0 && (
          <div className="mt-4 mb-0">
            <ProjectTargetTracker 
              currentAmount={currentFunding / 100} 
              targetAmount={totalCost} 
            />
          </div>
        )}
      </div>
    );
  };

  // Memoize the project title section to prevent rerenders
  const projectTitle = useMemo(() => renderProjectTitle(), [initialData, projectData?.data?.contribution_summary?.total_amount_cents, isLoading]);

  // Define tab content - memoized to prevent recreation on every render
  const tabs = useMemo(() => [
    {
      id: 'project',
      label: 'Project',
      icon: <i className="fa-solid fa-lightbulb" />,
      content: (
        <div className="px-6 py-12 pt-0 overflow-y-auto">
          {initialData ? (
            <ProjectDetails
              initialData={initialData}
              projectId={projectId}
              projectStatus={projectData?.data?.project.status}
              isReadOnly={true}
              isLoading={isLoading}
            />
          ) : (
            <ProjectDetailsSkeleton />
          )}
        </div>
      ),
      skeleton: <ProjectDetailsSkeleton />
    },
    {
      id: 'community',
      className: 'reverse-order',
      label: 'Community',
      icon: <i className="fa-solid fa-handshake-angle" />,
      footerExtension: <ProjectContributionsDialog projectId={projectId} />,
      content: (
        <div className="pb-6 pt-0 relative overflow-y-auto flex-grow flex flex-col">
          <ProjectContributions 
            projectId={projectId} 
            isLoading={isLoading}
          />
        </div>
      ),
      skeleton: <ProjectContributionsSkeleton />
    },
    {
      id: 'share',
      label: 'Share',
      icon: <i className="fa-solid fa-arrow-up-from-bracket" />,
      content: (
        <div className="p-6 pb-0 pt-0 overflow-y-auto">
          <ProjectShare 
            projectId={projectId}
            isLoading={isLoading}
          />
        </div>
      ),
      skeleton: <ProjectShareSkeleton className="px-6 pt-6" />
    },
    // Settings tab for project creators and admins
    {
      id: 'settings',
      label: 'Settings',
      icon: <i className="fa-solid fa-gear" />,
      content: (
        <div className="p-6 pt-0 overflow-y-auto">
          {initialData && (
            <ProjectSettings
              projectId={projectId}
              projectCreatorId={initialData._meta_created_by || ''}
              projectStatus={projectData?.data?.project.status || 'draft'}
              isLoading={isLoading}
            />
          )}
        </div>
      ),
      skeleton: (
        <div className="p-6 pt-6">
          <div className="h-8 w-3/4 animate-pulse bg-gray-200 dark:bg-gray-800 rounded mb-4"></div>
          <div className="h-12 w-full animate-pulse bg-gray-200 dark:bg-gray-800 rounded"></div>
        </div>
      )
    }
  ], [initialData, projectId, projectData?.data?.project.status, isLoading]);

  return (
    <div className="pointer-events-auto flex flex-col flex-1 overflow-hidden">
      <div className="frosted-glass rounded-2xl relative grid grid-rows-[auto_1fr_auto] overflow-hidden">
        {/* Close button */}
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-7 right-4 z-10 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
            aria-label="Close dialog"
          >
            <i className="fa-solid fa-chevron-down text-lg"></i>
          </button>
        )}
        
        <VisuallyHidden className="p-8 pb-0 flex items-center justify-between">
          <Dialog.Title className="sr-only">
            Project Details
          </Dialog.Title>
          <Dialog.Description className="sr-only">
            {initialData?.description}
          </Dialog.Description>
        </VisuallyHidden>

        <div className="overflow-y-hidden flex-1 flex flex-col">
          {projectTitle}
          
          <div className={cn(
            "flex-1 overflow-hidden flex flex-col",
            isLoading && "min-h-[400px] rounded-lg"
          )}>
            {initialData && (
              <CarouselTabs
                tabs={tabs}
                adaptiveHeight={true}
                tabPosition="bottom"
                className="mt-auto mb-2 relative"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

interface ProjectDetailsDialogProps {
  projectId: string
}

export function ProjectDetailsDialog({ projectId }: ProjectDetailsDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(true)
  
  const handleClose = () => {
    setOpen(false)
    // Wait for the animation to complete
    setTimeout(() => {
      router.push('/projects')
    }, 150)
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0" />
        <Dialog.Content className="dialog-content fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl p-4 overflow-visible max-h-[100dvh] flex flex-col">
          <ProjectDetailsContent 
            projectId={projectId} 
            onClose={handleClose} 
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
} 