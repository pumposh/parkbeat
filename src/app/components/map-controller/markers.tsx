import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { Project, ProjectGroup } from '@/hooks/use-tree-sockets'
import type maplibregl from 'maplibre-gl'
import { ProjectMarker } from './tree-marker'

const PROXIMITY_THRESHOLD = 50; // pixels

interface MarkersProps {
  projects: Project[]
  projectGroups?: ProjectGroup[]
  map: maplibregl.Map
  onMarkerNearCenter: (isNear: boolean) => void
}

export const Markers = ({ projects, projectGroups, map, onMarkerNearCenter }: MarkersProps) => {
  const [markers, setMarkers] = useState<{ [key: string]: { position: { x: number; y: number }, isNearCenter: boolean } }>({})
  const [groupMarkers, setGroupMarkers] = useState<{ [key: string]: { position: { x: number; y: number }, isNearCenter: boolean } }>({})
  const mapCenter = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const [focusedMarkerId, setFocusedMarkerId] = useState<string | null>(null)

  useEffect(() => {
    const updateMarkerPositions = () => {
      const newMarkers: typeof markers = {}
      const newGroupMarkers: typeof groupMarkers = {}
      const center = map.getContainer().getBoundingClientRect()
      mapCenter.current = {
        x: center.width / 2,
        y: center.height / 2
      }

      let isAnyMarkerNearCenter = false;
      let closestMarkerId: string | null = null;
      let minDistance = Infinity;

      // Update individual project markers
      [...projects, ...(projectGroups || [])].forEach(project => {
        const point = map.project([project._loc_lng, project._loc_lat])
        const dx = point.x - mapCenter.current.x
        const dy = point.y - mapCenter.current.y
        const distance = Math.sqrt(dx * dx + dy * dy)
        const isNearCenter = distance < PROXIMITY_THRESHOLD

        if (isNearCenter) {
          isAnyMarkerNearCenter = true
          if (distance < minDistance) {
            minDistance = distance
            closestMarkerId = project.id
          }
        }

        const isProject = 'status' in project;

        if (!isProject) {
          newGroupMarkers[project.id] = {
            position: { x: point.x, y: point.y },
            isNearCenter  
          }
        } else {
          newMarkers[project.id] = {
            position: { x: point.x, y: point.y },
            isNearCenter
          }
        }
      })

      // Only update focused marker if it's near center
      setFocusedMarkerId(isAnyMarkerNearCenter ? closestMarkerId : null)

      setMarkers(newMarkers)
      setGroupMarkers(newGroupMarkers)
      onMarkerNearCenter(isAnyMarkerNearCenter)
    }

    updateMarkerPositions()
    map.on('move', updateMarkerPositions)
    map.on('zoom', updateMarkerPositions)

    return () => {
      map.off('move', updateMarkerPositions)
      map.off('zoom', updateMarkerPositions)
    }
  }, [projects, projectGroups, map, onMarkerNearCenter])

  return createPortal(
    <div className="absolute inset-0 pointer-events-none">
      {/* Render project group markers */}
      {projectGroups?.map(group => {
        const marker = groupMarkers[group.id]
        if (!marker) return null
        return (
          <ProjectMarker
            key={group.id}
            group={group}
            position={marker.position}
            isNearCenter={marker.isNearCenter && focusedMarkerId === group.id}
            map={map}
          />
        )
      })}

      {/* Render individual project markers */}
      {projects.map(project => {
        const marker = markers[project.id]
        if (!marker) return null
        return (
          <ProjectMarker
            key={project.id}
            project={project}
            position={marker.position}
            isNearCenter={marker.isNearCenter && focusedMarkerId === project.id}
            map={map}
          />
        )
      })}
    </div>,
    map.getCanvasContainer()
  )
} 