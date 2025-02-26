import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { Project, ProjectGroup, ContributionSummary } from '@/hooks/use-tree-sockets'
import type maplibregl from 'maplibre-gl'
import { ProjectMarker } from './tree-marker'

const PROXIMITY_THRESHOLD = 50; // pixels

interface MarkersProps {
  projects: Project[]
  projectGroups?: ProjectGroup[]
  map: maplibregl.Map
  onMarkerNearCenter: (isNear: boolean) => void
  contributionSummaryMap?: Map<string, ContributionSummary>
}

interface Marker {
  position: { x: number; y: number }
  isNearCenter: boolean
  isDeleted?: boolean
}

export const Markers = ({ projects, projectGroups, map, onMarkerNearCenter, contributionSummaryMap }: MarkersProps) => {
  const [markers, setMarkers] = useState<{ [key: string]: Marker }>({})
  const [groupMarkers, setGroupMarkers] = useState<{ [key: string]: Marker }>({})
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

      const currentMarkers = new Map([
        ...Object.entries(markers),
      ]);
      const currentGroupMarkers = new Map([
        ...Object.entries(groupMarkers),
      ]);

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
        currentMarkers.delete(project.id)
        currentGroupMarkers.delete(project.id)
      })

      const deletedMarkers = Array.from(currentMarkers)
        .map(([id, marker]) => ({ id, ...marker, isDeleted: true }))
      const deletedGroupMarkers = Array.from(currentGroupMarkers)
        .map(([id, marker]) => ({ id, ...marker, isDeleted: true }))
      setTimeout(() => {
        const deletedKeys = [
          ...deletedMarkers.map(({ id }) => id),
          ...deletedGroupMarkers.map(({ id }) => id)
        ]
        const updateMarkers = (prev: { [key: string]: Marker }) => {
          const newMarkers = { ...prev }
          deletedKeys.forEach((id) => {
            if (!newMarkers[id]) return
            delete newMarkers[id]
          })
          return newMarkers
        };
        setMarkers(updateMarkers)
        setGroupMarkers(updateMarkers)
      }, 300)

      // Only update focused marker if it's near center
      setFocusedMarkerId(isAnyMarkerNearCenter ? closestMarkerId : null)

      setMarkers({
        ...newMarkers,
        ...Object.fromEntries(
          deletedMarkers.map(({ id, ...marker }) => [id, marker])
        )
      })
      setGroupMarkers({
        ...newGroupMarkers,
        ...Object.fromEntries(
          deletedGroupMarkers.map(({ id, ...marker }) => [id, marker])
        )
      })
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
            isDeleted={marker.isDeleted}
            position={marker.position}
            isNearCenter={marker.isNearCenter && focusedMarkerId === group.id}
            map={map}
          />
        )
      })}

      {/* Render individual project markers */}
      {Object.entries(markers).map(([id, marker]) => {
        const project = projects.find(p => p.id === id)
        const contributionSummary = contributionSummaryMap?.get(id)
        console.log('[Markers] contributionSummary', project?.id, contributionSummary)
        return (
          <ProjectMarker
            key={id}
            project={project}
            isDeleted={marker.isDeleted}
            position={marker.position}
            isNearCenter={marker.isNearCenter && focusedMarkerId === id}
            map={map}
            contributionSummary={contributionSummary}
          />
        )
      })}
    </div>,
    map.getCanvasContainer()
  )
} 