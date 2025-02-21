'use client'

import type { Project, ProjectGroup } from '@/hooks/use-tree-sockets'
import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ProjectInfoPanel } from './tree-info-panel'
import type maplibregl from 'maplibre-gl'
import { cn } from '@/lib/utils'

interface ProjectMarkerProps {
  project?: Project
  group?: ProjectGroup
  position: { x: number; y: number }
  isNearCenter?: boolean
  isDeleted?: boolean
  map: maplibregl.Map
}

export const ProjectMarker = ({ project, group, position, isNearCenter, isDeleted, map }: ProjectMarkerProps) => {
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
        <ProjectInfoPanel 
          project={project}
          group={group}
          position={position}   
          isVisible={showInfoPanel && !isDeleted}
        />,
        map.getCanvasContainer()
      )}
      <button
        className={cn(
          "project-marker-button",
          isDeleted ? "leaving" : ""
        )}
        style={{ 
          '--marker-x': `${position.x}px`,
          '--marker-y': `${position.y}px`,
          transform: `translate(${position.x}px, ${position.y}px)`,
        } as React.CSSProperties}
        onClick={(e) => {
          if (isDeleted) return
          e.stopPropagation()
          e.preventDefault()

          const lat = project?._loc_lat ?? group?._loc_lat ?? 0
          const lng = project?._loc_lng ?? group?._loc_lng ?? 0

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
            className={cn(
              "project-marker-container duration-200 ease-out group-hover:scale-110",
              isDeleted ? "leaving" : ""
            )}
            style={{ 
              filter: 'drop-shadow(0 2px 2px rgba(0, 0, 0, 0.1)) invert(1) brightness(0.15)',
              opacity: project?.status === 'draft' ? 0.6 : 1,
            }}
          >
            <img 
              src="/pin.svg" 
              alt="Project" 
              className="w-12 h-12"
            />
          </div>
        </div>
      </button>
    </>
  )
} 