import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { Tree } from '../treebeds/live-trees'
import type maplibregl from 'maplibre-gl'
import { TreeInfoPanel } from './tree-info-panel'

interface TreeMarkerProps {
  tree: Tree
  position: { x: number; y: number }
  isNearCenter: boolean
  map: maplibregl.Map
}

export const TreeMarker = ({ tree, position, isNearCenter, map }: TreeMarkerProps) => {
  const [showInfo, setShowInfo] = useState(false)

  useEffect(() => {
    if (!isNearCenter) {
      setShowInfo(false)
    } else {
      // Small delay before showing to allow for smooth transitions
      const timeout = setTimeout(() => {
        setShowInfo(true)
      }, 50)
      return () => clearTimeout(timeout)
    }
  }, [isNearCenter])

  return (
    <>
      {createPortal(
        <TreeInfoPanel 
          tree={tree} 
          position={position}
          isVisible={showInfo}
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
          
          map.flyTo({
            center: [tree._loc_lng, tree._loc_lat],
            zoom: 16,
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
              opacity: tree.status === 'archived' ? 0.6 : 1,
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