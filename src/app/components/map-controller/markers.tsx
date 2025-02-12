import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { Tree } from '../treebeds/live-trees'
import type maplibregl from 'maplibre-gl'
import { TreeMarker } from './tree-marker'

const PROXIMITY_THRESHOLD = 50; // pixels

interface MarkersProps {
  trees: Tree[]
  map: maplibregl.Map
  onMarkerNearCenter: (isNear: boolean) => void
}

export const Markers = ({ trees, map, onMarkerNearCenter }: MarkersProps) => {
  const [markers, setMarkers] = useState<{ [key: string]: { position: { x: number; y: number }, isNearCenter: boolean } }>({})
  const mapCenter = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

  useEffect(() => {
    const updateMarkerPositions = () => {
      const newMarkers: typeof markers = {}
      const center = map.getContainer().getBoundingClientRect()
      mapCenter.current = {
        x: center.width / 2,
        y: center.height / 2
      }

      let isAnyMarkerNearCenter = false
      trees.forEach(tree => {
        const point = map.project([tree._loc_lng, tree._loc_lat])
        const dx = point.x - mapCenter.current.x
        const dy = point.y - mapCenter.current.y
        const distance = Math.sqrt(dx * dx + dy * dy)
        const isNearCenter = distance < PROXIMITY_THRESHOLD

        if (isNearCenter) {
          isAnyMarkerNearCenter = true
        }

        newMarkers[tree.id] = {
          position: { x: point.x, y: point.y },
          isNearCenter
        }
      })

      setMarkers(newMarkers)
      onMarkerNearCenter(isAnyMarkerNearCenter)
    }

    updateMarkerPositions()
    map.on('move', updateMarkerPositions)
    map.on('zoom', updateMarkerPositions)

    return () => {
      map.off('move', updateMarkerPositions)
      map.off('zoom', updateMarkerPositions)
    }
  }, [trees, map, onMarkerNearCenter])

  return createPortal(
    <div className="absolute inset-0 pointer-events-none">
      {trees.map(tree => {
        const marker = markers[tree.id]
        if (!marker) return null
        return (
          <TreeMarker
            key={tree.id}
            tree={tree}
            position={marker.position}
            isNearCenter={marker.isNearCenter}
            map={map}
          />
        )
      })}
    </div>,
    map.getCanvasContainer()
  )
} 