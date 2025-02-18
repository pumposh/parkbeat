import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { Tree } from '@/hooks/use-tree-sockets'
import type { TreeGroup } from '@/lib/geo/threshGrouping'
import type maplibregl from 'maplibre-gl'
import { TreeMarker } from './tree-marker'

const PROXIMITY_THRESHOLD = 50; // pixels

interface MarkersProps {
  trees: Tree[]
  treeGroups?: TreeGroup[]
  map: maplibregl.Map
  onMarkerNearCenter: (isNear: boolean) => void
}

export const Markers = ({ trees, treeGroups, map, onMarkerNearCenter }: MarkersProps) => {
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

      // Update individual tree markers
      [...trees, ...(treeGroups || [])].forEach(tree => {
        const point = map.project([tree._loc_lng, tree._loc_lat])
        const dx = point.x - mapCenter.current.x
        const dy = point.y - mapCenter.current.y
        const distance = Math.sqrt(dx * dx + dy * dy)
        const isNearCenter = distance < PROXIMITY_THRESHOLD

        if (isNearCenter) {
          isAnyMarkerNearCenter = true
          if (distance < minDistance) {
            minDistance = distance
            closestMarkerId = tree.id
          }
        }

        const isTree = 'status' in tree;

        if (!isTree) {
          newGroupMarkers[tree.id] = {
            position: { x: point.x, y: point.y },
            isNearCenter  
          }
        } else {
          newMarkers[tree.id] = {
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
  }, [trees, treeGroups, map, onMarkerNearCenter])

  return createPortal(
    <div className="absolute inset-0 pointer-events-none">
      {/* Render tree group markers */}
      {treeGroups?.map(group => {
        const marker = groupMarkers[group.id]
        if (!marker) return null
        return (
          <TreeMarker
            key={group.id}
            group={group}
            position={marker.position}
            isNearCenter={marker.isNearCenter && focusedMarkerId === group.id}
            map={map}
          />
        )
      })}

      {/* Render individual tree markers */}
      {trees.map(tree => {
        const marker = markers[tree.id]
        if (!marker) return null
        return (
          <TreeMarker
            key={tree.id}
            tree={tree}
            position={marker.position}
            isNearCenter={marker.isNearCenter && focusedMarkerId === tree.id}
            map={map}
          />
        )
      })}
    </div>,
    map.getCanvasContainer()
  )
} 