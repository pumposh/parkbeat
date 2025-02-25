'use client'

import { useState, useEffect } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useRouter } from 'next/navigation'
import { ProjectDetails } from './project-details'
import { useProjectData } from '@/hooks/use-tree-sockets'
import type { ProjectFormData } from '../tree-dialog'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'

interface ProjectDetailsDialogProps {
  projectId: string
}

export function ProjectDetailsDialog({ projectId }: ProjectDetailsDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(true)
  const { projectData, disconnect } = useProjectData(projectId)
  const [initialData, setInitialData] = useState<ProjectFormData | null>(null)

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
        suggestion: suggestion
      })
    }
  }, [projectData])

  const handleClose = () => {
    setOpen(false)
    disconnect()
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
          <div className="pointer-events-auto flex flex-col flex-1 overflow-hidden">
            <div className="frosted-glass rounded-2xl relative grid grid-rows-[auto_1fr_auto] overflow-hidden">
              <VisuallyHidden className="p-8 pb-0 flex items-center justify-between">
                <Dialog.Title className="sr-only">
                  Project Details
                </Dialog.Title>
                <Dialog.Description className="sr-only">
                  {initialData?.description}
                </Dialog.Description>
              </VisuallyHidden>

              <div className="overflow-y-auto flex-1 p-8 pt-4">
                <ProjectDetails
                  initialData={initialData || {
                    id: projectId,
                    name: '',
                    description: '',
                    location: null,
                    viewParams: {
                      heading: 0,
                      pitch: 0,
                      zoom: 1
                    }
                  }}
                  projectId={projectId}
                  projectStatus={projectData?.data.project.status}
                  isReadOnly={true}
                  isLoading={!initialData || initialData.id !== projectId}
                />
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
} 