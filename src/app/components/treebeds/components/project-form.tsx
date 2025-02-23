import { useCallback, useState } from 'react'
import type { LocationInfo } from '@/types/types'
import type { ProjectStatus } from '@/server/types/shared'
import { useLiveTrees } from '@/hooks/use-tree-sockets'

type OnUpdateProject = Partial<Parameters<ReturnType<typeof useLiveTrees>['setProject']>[0]>

interface ProjectFormData {
  name: string
  description: string
  location: {
    lat: number
    lng: number
  } | null
  locationInfo?: LocationInfo
  viewParams?: {
    heading: number
    pitch: number
    zoom: number
  }
}

interface ProjectFormProps {
  initialData: ProjectFormData
  projectId: string
  projectStatus?: ProjectStatus
  onUpdateProject: (data: OnUpdateProject) => void
}

export function ProjectForm({ initialData, projectId, projectStatus = 'draft', onUpdateProject }: ProjectFormProps) {
  // Individual field states
  const [name, setName] = useState(initialData.name)
  const [description, setDescription] = useState(initialData.description)

  // Individual field change handlers
  const handleNameChange = useCallback((newName: string) => {
    console.log('[ProjectForm] Name changed:', newName)
    setName(newName)
    onUpdateProject({
      id: projectId,
      name: newName,
      status: projectStatus
    })
  }, [projectId, projectStatus, onUpdateProject])

  const handleDescriptionChange = useCallback((newDescription: string) => {
    console.log('[ProjectForm] Description changed:', newDescription)
    setDescription(newDescription)
    onUpdateProject({
      id: projectId,
      description: newDescription,
      status: projectStatus
    })
  }, [projectId, projectStatus, onUpdateProject])

  return (
    <div className="space-y-0">
      <div>
        <input
          type="text"
          id="name"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          className="input w-full text-lg py-4 px-6 rounded-b-none"
          placeholder="Tree bed name"
          required
        />
      </div>
      <div>
        <textarea
          id="description"
          value={description}
          onChange={(e) => handleDescriptionChange(e.target.value)}
          rows={3}
          className="input w-full px-6 rounded-t-none pt-6 border-t-0"
          placeholder="Describe the tree bed location and any special care instructions..."
          required
        />
      </div>
    </div>
  )
}