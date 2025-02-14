'use client'

import { useRouter } from 'next/navigation'
import * as Dialog from '@radix-ui/react-dialog'
import { useState } from 'react'
import type { LocationInfo } from '@/types/types'
import type { Tree } from '@/server/routers/tree-router'
import { StepFormDialog } from '../ui/step-form-dialog'
import { LocationInfoCard } from './components/location-info-card'
import { StreetViewCard } from './components/street-view-card'
import { useToast } from '@/app/components/toast'
import { useLiveTrees } from '@/hooks/use-tree-sockets'
import { useParams } from 'next/navigation'
import { client } from '@/lib/client'

interface TreeFormData {
  name: string
  description: string
  location: {
    lat: number
    lng: number
  } | null
  locationInfo?: LocationInfo
}

export function TreeDialog(props: {
  lat?: number
  lng?: number
  info?: LocationInfo
  tree?: Tree
}) {
  const router = useRouter()
  const params = useParams()
  const treeId = params.treeId as string
  const { setTree, isPending } = useLiveTrees()
  const { show: showToast } = useToast()
  const [open, setOpen] = useState(true)
  const [currentStep, setCurrentStep] = useState(0)
  const [formData, setFormData] = useState<TreeFormData>({
    name: props.info?.address?.street || "",
    description: "",
    location: props.lat && props.lng ? { lat: props.lat, lng: props.lng } : null,
    locationInfo: props.info
  })
  const [isLoadingLocation, setIsLoadingLocation] = useState(false)
  const { deleteTree, isDeletePending } = useLiveTrees()

  const handleClose = () => {
    setOpen(false)
    // Wait for the animation to complete
    setTimeout(() => {
      router.push('/manage-trees')
    }, 150)
  }

  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    try {
      setIsDeleting(true)
      await deleteTree({ id: treeId })
      handleClose()
    } catch (err) {
      console.error("Failed to delete project:", err)
      showToast({
        message: 'Something went wrong when deleting the project',
        type: 'error'
      })
    } finally {
      setIsDeleting(false)
    }
  }

  const handleCancel = () => {
    handleClose()
  }

  const handleSaveAsDraft = async () => {
    if (!formData.location) return

    try {
      await setTree({
        id: treeId,
        name: formData.name || 'Untitled Tree Bed',
        description: formData.description,
        lat: formData.location.lat,
        lng: formData.location.lng,
        status: 'draft'
      })
      showToast({
        message: 'Tree bed saved as draft',
        type: 'success'
      })
      handleClose()
    } catch (err) {
      console.error("Failed to save tree bed as draft:", err)
      showToast({
        message: 'Failed to save as draft',
        type: 'error'
      })
    }
  }

  const handleSubmit = async () => {
    if (!formData.location) return

    try {
      await setTree({
        id: treeId,
        name: formData.name,
        description: formData.description,
        lat: formData.location.lat,
        lng: formData.location.lng,
        status: 'live'
      })
      showToast({
        message: 'Tree bed created successfully',
        type: 'success'
      })
      handleClose()
    } catch (err) {
      console.error("Failed to create tree bed:", err)
      showToast({
        message: 'Failed to create tree bed',
        type: 'error'
      })
    }
  }

  const steps = [
    {
      title: "Let's get some pictures",
      content: (
        <div className="space-y-6">
          <LocationInfoCard
            location={formData.location}
            locationInfo={formData.locationInfo}
            isLoading={isLoadingLocation}
          />
          {formData.location && (
            <StreetViewCard
              lat={formData.location.lat}
              lng={formData.location.lng}
              isLoading={isLoadingLocation}
            />
          )}
        </div>
      )
    },
    {
      title: "Add Details",
      content: (
        <div className="space-y-0">
          <div>
            <input
              type="text"
              id="name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="input w-full text-lg py-4 px-6 rounded-b-none"
              placeholder="Tree bed name"
              required
            />
          </div>
          <div>
            <textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              rows={3}
              className="input w-full px-6 rounded-t-none pt-6 border-t-0"
              placeholder="Describe the tree bed location and any special care instructions..."
              required
            />
          </div>
        </div>
      )
    }
  ]

  const canSubmit = Boolean(
    formData.location &&
    formData.name.trim() &&
    formData.description.trim()
  )

  return (
    <StepFormDialog
      open={open}
      onOpenChange={setOpen}
      steps={steps}
      currentStep={currentStep}
      onStepChange={setCurrentStep}
      onClose={handleClose}
      onCancel={handleDelete}
      onSubmit={handleSubmit}
      isSubmitting={isPending}
      canSubmit={canSubmit}
      cancelAction={{
        type: 'draft-or-delete',
        draftTitle: 'Keep draft',
        deleteTitle: 'Delete',
        subtitle: 'Would you like to keep this tree bed as a draft or delete it?',
        onSaveAsDraft: handleClose,
        isDeleting
      }}
    />
  )
} 