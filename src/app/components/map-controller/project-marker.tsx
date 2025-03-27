'use client'

import type { Project, ProjectGroup, ContributionSummary } from '@/hooks/use-tree-sockets'
import { useLiveTrees } from '@/hooks/use-tree-sockets'
import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ProjectInfoPanel } from './project-info-panel'
import type maplibregl from 'maplibre-gl'
import { cn } from '@/lib/utils'
import { calculateProjectCosts } from '@/lib/cost'

interface ProjectMarkerProps {
  project?: Project
  group?: ProjectGroup
  position: { x: number; y: number }
  isNearCenter?: boolean
  isDeleted?: boolean
  map: maplibregl.Map
  contributionSummary?: ContributionSummary
}

// Helper function to determine marker appearance based on project status and funding
function getMarkerStyles(project?: Project, contributionSummary?: ContributionSummary) {
  if (!project) return { color: '#888888', scale: 1, opacity: 0.7 };
  
  // Default styles by status
  const statusStyles = {
    'draft': { color: '#888888', scale: 0.9, opacity: 0.7 },
    'active': { color: '#10B981', scale: 1, opacity: 1 },
    'funded': { color: '#F59E0B', scale: 1, opacity: 1 },
    'completed': { color: '#3B82F6', scale: 1, opacity: 1 },
    'archived': { color: '#6B7280', scale: 0.9, opacity: 0.6 }
  };
  
  // Get funding progress if available
  let fundingPercentage = 0;
  if (project.cost_breakdown && contributionSummary) {
    const costs = calculateProjectCosts(project.cost_breakdown);
    const totalAmount = contributionSummary.total_amount_cents / 100;
    fundingPercentage = (costs?.total ?? 0) > 0 ? (totalAmount / (costs?.total ?? 0)) * 100 : 0;
  }
  
  // Adjust color based on funding progress for active projects
  let style = statusStyles[project.status] || statusStyles.draft;
  
  // For active projects, adjust color based on funding progress
  if (project.status === 'active' && fundingPercentage > 0) {
    if (fundingPercentage >= 75) {
      style.color = '#F59E0B'; // Yellow-orange for nearly funded
    } else if (fundingPercentage >= 50) {
      style.color = '#84CC16'; // Lime-green for halfway funded
    } else if (fundingPercentage >= 25) {
      style.color = '#4ADE80'; // Light green for starting to get funded
    }
  }
  
  return style;
}

export const ProjectMarker = ({ project, group, position, isNearCenter, isDeleted, map }: ProjectMarkerProps) => {
  const [showInfoPanel, setShowInfoPanel] = useState(false)
  const [isPanelLoading, setIsPanelLoading] = useState(false)
  const markerLoadTimeRef = useRef<number | null>(null)
  const projectIdRef = useRef<string | null>(null)
  
  // Directly access contribution data from useLiveTrees hook
  const { contributionSummaryMap, isPending, connectionState } = useLiveTrees()
  const contributionSummary = contributionSummaryMap?.get(project?.id ?? "")
  
  const markerStyle = getMarkerStyles(project, contributionSummary);

  useEffect(() => {
    // Track changes to project ID for debugging
    if (project?.id !== projectIdRef.current) {
      projectIdRef.current = project?.id ?? null
    }
    
    // Only consider data missing if we have a project but no contribution data for an active project
    const needsContributionData = project?.status !== 'draft' && !contributionSummary
    const isDataMissing = !project || (needsContributionData && isPending)
    const isConnectionReady = connectionState === 'connected'
    
    // Debug loading time when near center changes
    if (isNearCenter && !showInfoPanel) {
      markerLoadTimeRef.current = performance.now()
      
      // Only set loading state if we're actually waiting for data
      const shouldShowLoading = isDataMissing || !isConnectionReady
      setIsPanelLoading(shouldShowLoading)
      
      // Always show the info panel immediately when near center, but with loading state if data is missing
      setShowInfoPanel(true)
      
      if (shouldShowLoading) {
        console.log(`[ProjectMarker] Starting to load panel for project: ${project?.id}, waiting for ${!isConnectionReady ? 'connection' : 'data'}`)
      } else {
        console.log(`[ProjectMarker] Panel data already available for project: ${project?.id}`)
      }
    }

    if (!isNearCenter) {
      setShowInfoPanel(false)
      setIsPanelLoading(false)
      markerLoadTimeRef.current = null
    } else {
      // Adjust timeout duration based on data availability
      let timeoutDuration = 50
      
      // Only use longer timeouts if we're actually waiting for something
      if (!isConnectionReady) {
        timeoutDuration = 250 // Longer timeout for connection issues
      } else if (isDataMissing) {
        timeoutDuration = 100 // Moderate timeout for data still loading
      }
      
      const timeout = setTimeout(() => {
        // Panel is already showing with loading state, now we'll update loading state to false
        setIsPanelLoading(false)
        
        if (markerLoadTimeRef.current) {
          const loadTime = performance.now() - markerLoadTimeRef.current
          console.log(`[ProjectMarker] Panel loaded for project: ${project?.id} in ${loadTime.toFixed(2)}ms`)
          
          // Only log warning if load time is excessive AND we were actually loading data
          if (loadTime > 1000 && (isDataMissing || !isConnectionReady)) {
            console.warn(`[ProjectMarker] Slow panel load detected (${loadTime.toFixed(2)}ms) for project: ${project?.id}`)
          }
        }
      }, timeoutDuration)
      
      return () => clearTimeout(timeout)
    }
  }, [isNearCenter, project, isPending, contributionSummary, showInfoPanel, connectionState])

  // Pre-load contribution data when marker is somewhat near center
  useEffect(() => {
    if (project?.id && project?.status !== 'draft' && !contributionSummary && connectionState === 'connected') {
      console.log(`[ProjectMarker] Pre-fetching contribution data for project: ${project.id}`)
      // Contribution data will be loaded automatically through the current mechanism,
      // we're just logging when we start the pre-loading process
    }
  }, [project?.id, project?.status, contributionSummary, connectionState])

  return (
    <>
      {createPortal(
        <ProjectInfoPanel 
          project={project}
          group={group}
          position={position}   
          isVisible={showInfoPanel && !isDeleted}
          isLoading={isPanelLoading}
          contributionSummary={contributionSummary}
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
              filter: `drop-shadow(0 2px 2px rgba(0, 0, 0, 0.1))`,
              opacity: markerStyle.opacity,
            }}
          >
            <div className="relative">
              <img 
                src="/pin.svg" 
                alt="Project" 
                className="w-12 h-12"
                style={{
                  filter: `hue-rotate(${getHueRotation(markerStyle.color)}) saturate(1.5)`,
                }}
              />
              {/* Status icon overlay */}
              {/* <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-[80%] text-white">
                <i className={cn(
                  "fa-solid text-xs",
                  {
                    'fa-seedling': project?.status === 'draft',
                    'fa-tree': project?.status === 'active',
                    'fa-coins': project?.status === 'funded',
                    'fa-check-circle': project?.status === 'completed',
                    'fa-archive': project?.status === 'archived', */}
                    {/* 'fa-layer-group': group
                  }
                )} /> */}
            </div>
          </div>
        </div>
      </button>
    </>
  )
}

// Helper function to convert hex color to hue-rotation value
function getHueRotation(hexColor: string): string {
  // Convert hex to RGB
  const r = parseInt(hexColor.slice(1, 3), 16) / 255;
  const g = parseInt(hexColor.slice(3, 5), 16) / 255;
  const b = parseInt(hexColor.slice(5, 7), 16) / 255;
  
  // Find the hue
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  
  let h = 0;
  
  if (max === min) {
    h = 0; // achromatic
  } else {
    const d = max - min;
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  
  // Convert to degrees and return
  return `${Math.round(h * 360)}deg`;
} 