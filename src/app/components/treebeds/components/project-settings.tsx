'use client'

import { useState } from 'react'
import { useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { UserAvatar } from '@/app/components/ui/user-avatar'
import { UserName } from '@/app/components/ui/user-name'
import { WebSocketManager } from '@/hooks/websocket-manager'
import type { ProjectStatus } from '@/server/types/shared'
import * as Dialog from '@radix-ui/react-dialog'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'

interface ProjectSettingsProps {
  projectId: string
  projectCreatorId: string
  projectStatus: ProjectStatus
  className?: string
  isLoading?: boolean
}

export function ProjectSettings({
  projectId,
  projectCreatorId,
  projectStatus,
  className,
  isLoading = false
}: ProjectSettingsProps) {
  const router = useRouter()
  const { user } = useUser()
  const [isUpdating, setIsUpdating] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)
  
  // Check if user is admin or project creator
  const isAdmin = user?.organizationMemberships?.some(
    (membership) => membership.role === "org:admin"
  )
  const isProjectCreator = user?.id === projectCreatorId
  const canModifyProject = isAdmin || isProjectCreator
  
  // If user doesn't have permission to modify project, don't render anything
  if (!canModifyProject) {
    return null
  }
  
  const handleArchiveProject = async () => {
    if (!projectId || isUpdating) return
    
    try {
      setIsUpdating(true)
      
      // Send the archive project event using WebSocketManager
      const wsManager = WebSocketManager.getInstance()
      await wsManager.emit('archiveProject', { id: projectId })
      
      // We don't need to handle the response here as the socket system
      // will update the UI through the subscription system
      setShowConfirmation(false)
      
      // Navigate to projects route after successful archival
      router.push('/projects')
    } catch (error) {
      console.error('Error archiving project:', error)
    } finally {
      setIsUpdating(false)
    }
  }
  
  if (isLoading) {
    return (
      <div className={cn("mt-4 space-y-4", className)}>
        <div className="h-8 w-3/4 animate-pulse bg-gray-200 dark:bg-gray-800 rounded"></div>
        <div className="h-12 w-full animate-pulse bg-gray-200 dark:bg-gray-800 rounded"></div>
      </div>
    )
  }
  
  return (
    <div className={cn("space-y-4", className)}>
      <div className="pt-4 mt-4">
        
        <div className="space-y-4">
          {/* Project creator info */}
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-black/10 rounded-lg">
            <span className="text-sm text-gray-500 dark:text-gray-400">Project creator</span>
            <div className="flex items-center gap-2">
              <UserName userId={projectCreatorId} className="text-sm font-medium" />
              <UserAvatar userId={projectCreatorId} size={24} />
            </div>
          </div>
          
          {/* Project management actions */}
          {projectStatus !== 'archived' && (
            <>
              <button
                onClick={() => setShowConfirmation(true)}
                disabled={isUpdating}
                className={cn(
                  "standard-button frosted-glass w-full py-2.5 px-4 flex justify-between items-center",
                  "text-sm text-gray-700 dark:text-gray-200 rounded-lg transition-colors",
                  "hover:bg-gray-100 dark:hover:bg-gray-800/30",
                  "disabled:opacity-50 disabled:pointer-events-none"
                )}
              >
                <span className="flex items-center gap-2">
                  <i className="fa-solid fa-archive text-gray-500 dark:text-gray-400" />
                  Archive Project
                </span>
                <i className="fa-solid fa-chevron-right text-sm text-gray-400" />
              </button>
              
              {/* Confirmation Dialog */}
              <Dialog.Root open={showConfirmation} onOpenChange={setShowConfirmation}>
                <Dialog.Portal>
                  <Dialog.Overlay className="dialog-overlay fixed inset-0" />
                  <Dialog.Content className="dialog-content fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md p-4 overflow-visible">
                    <div className="pointer-events-auto">
                      <div className="frosted-glass p-6 relative rounded-t-2xl md:rounded-2xl">
                        <VisuallyHidden>
                          <Dialog.Title className="sr-only">Archive Project</Dialog.Title>
                          <Dialog.Description className="sr-only">
                            Confirm you want to archive this project
                          </Dialog.Description>
                        </VisuallyHidden>
                        
                        <div className="flex items-center gap-3 mb-4">
                          <i className="fa-solid fa-archive text-xl text-amber-500 dark:text-amber-400" aria-hidden="true" />
                          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                            Archive Project
                          </h3>
                        </div>
                        
                        <p className="text-gray-600 dark:text-gray-300 mb-6">
                          Are you sure you want to archive this project? Archived projects will no longer appear on the map or in search results.
                        </p>
                        
                        <div className="flex gap-3 justify-end">
                          <button 
                            onClick={() => setShowConfirmation(false)}
                            className={cn(
                              "standard-button frosted-glass py-2 px-4 rounded-lg",
                              "text-gray-700 dark:text-gray-200",
                            )}
                          >
                            Cancel
                          </button>
                          <button 
                            onClick={handleArchiveProject}
                            disabled={isUpdating}
                            className={cn(
                              "standard-button frosted-glass py-2 px-4 rounded-lg",
                              "disabled:opacity-50 disabled:pointer-events-none"
                            )}
                          >
                            {isUpdating ? (
                              <span className="flex items-center gap-2">
                                <i className="fa-solid fa-circle-notch fa-spin" />
                                Archiving...
                              </span>
                            ) : 'Archive'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </Dialog.Content>
                </Dialog.Portal>
              </Dialog.Root>
            </>
          )}
        </div>
      </div>
    </div>
  )
} 