'use client'

import type { Tree } from '@/hooks/use-tree-sockets'
import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { TreeInfoPanel } from './tree-info-panel'
import type maplibregl from 'maplibre-gl'
import { TreeGroup } from '@/lib/geo/threshGrouping'

interface TreeMarkerProps {
  tree?: Tree
  group?: TreeGroup
  position: { x: number; y: number }
  isNearCenter?: boolean
  map: maplibregl.Map
}

export const TreeMarker = ({ tree, group, position, isNearCenter, map }: TreeMarkerProps) => {
  const [showInfoPanel, setShowInfoPanel] = useState(false)

  useEffect(() => {
    if (!isNearCenter) {
      setShowInfoPanel(false)
    } else {
      // Small delay before showing to allow for smooth transitions
      const timeout = setTimeout(() => {
        setShowInfoPanel(true)
      }, 50)
      return () => clearTimeout(timeout)
    }
  }, [isNearCenter])

  return (
    <>
      {createPortal(
        <TreeInfoPanel 
          tree={tree}
          group={group}
          position={position}   
          isVisible={showInfoPanel}
        />,
        map.getCanvasContainer()
      )}
      <button
        className="absolute pointer-events-auto"
        style={{ 
          transform: `translate(${position.x}px, ${position.y}px) translate(-50%, -100%)`,
        }}
        onClick={(e) => {
          e.stopPropagation()
          e.preventDefault()

          const lat = tree?._loc_lat ?? group?._loc_lat ?? 0
          const lng = tree?._loc_lng ?? group?._loc_lng ?? 0

          const zoom = map.getZoom();
          console.log(`[TreeMarker] Zoom: ${zoom}`);
          
          map.flyTo({
            zoom: zoom < 11 ? 12 : undefined,
            center: [lng, lat],
            duration: 1000,
            essential: true
          })
        }}
      >
        <div className="relative group cursor-pointer">
          <div 
            className="tree-marker-container duration-200 ease-out group-hover:scale-110"
            style={{ 
              filter: 'drop-shadow(0 2px 2px rgba(0, 0, 0, 0.1)) invert(1) brightness(0.15)',
              opacity: tree?.status === 'draft' ? 0.6 : 1,
            }}
          >
            <img 
              src="/pin.svg" 
              alt="Tree" 
              className="w-12 h-12"
            />
          </div>
        </div>
      </button>
    </>
  )
} 