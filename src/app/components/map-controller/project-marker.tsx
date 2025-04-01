'use client'

import type { Project, ProjectGroup, ContributionSummary } from '@/hooks/use-tree-sockets'
import { useLiveTrees } from '@/hooks/use-tree-sockets'
import { useState, useEffect, useRef, memo } from 'react'
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
    'draft': { color: '#FFA07A', scale: 0.9, opacity: 0.7 }, // Light orange for draft
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
  let style = {...(statusStyles[project.status] || statusStyles.draft)};
  
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

// Get the appropriate CSS filter for a project based on its status
function getMarkerFilter(status?: string): string {
  if (!status) return "brightness(0.9) drop-shadow(0 2px 2px rgba(0, 0, 0, 0.1))";
  
  switch (status) {
    case 'draft':
      // Light orange filter (no hue rotation, just sepia and saturation)
      return "hue-rotate(-45deg) brightness(2) saturate(1.9) drop-shadow(0 2px 2px rgba(0, 0, 0, 0.1))";
    case 'active':
      // Grayscale for active projects
      return "grayscale(1) drop-shadow(0 2px 2px rgba(0, 0, 0, 0.1))";
    case 'funded':
      // No transformation for funded (just drop shadow)
      return "drop-shadow(0 2px 2px rgba(0, 0, 0, 0.1))";
    case 'completed':
      // Slight blue tint
      return "hue-rotate(200deg) saturate(0.8) drop-shadow(0 2px 2px rgba(0, 0, 0, 0.1))";
    case 'archived':
      // Desaturated and darker
      return "grayscale(0.5) brightness(0.8) drop-shadow(0 2px 2px rgba(0, 0, 0, 0.1))";
    default:
      return "drop-shadow(0 2px 2px rgba(0, 0, 0, 0.1))";
  }
}

// Wrap the component with memo for better performance
const UnmemoizedProjectMarker = ({ project, group, position, isNearCenter, isDeleted, map }: ProjectMarkerProps) => {
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
      }, timeoutDuration)
      
      return () => clearTimeout(timeout)
    }
  }, [isNearCenter, project, isPending, contributionSummary, showInfoPanel, connectionState])

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
              opacity: markerStyle.opacity,
            }}
          >
            <div className="relative"
              style={{
                filter: getMarkerFilter(project?.status),
              }}
            >
              <img 
                src="/pin-green.svg" 
                alt="Project" 
                className="w-12 h-12"
              />
              {/* Status icon overlay */}
              <div className={
                cn(
                  "absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-[80%]",
                  "text-[#18351F]"
                )}
              >
                <i className={cn(
                  "fa-solid text-sm",
                  {
                    'fa-seedling': project?.status === 'draft',
                    'fa-tree': project?.status === 'active',
                    'fa-coins': project?.status === 'funded',
                    'fa-check-circle': project?.status === 'completed',
                    'fa-archive': project?.status === 'archived',
                    'fa-layer-group': !project && group
                  }
                )} />
              </div>
            </div>
          </div>
        </div>
      </button>
    </>
  )
}

// Export a memoized version with custom comparison
export const ProjectMarker = memo(UnmemoizedProjectMarker, (prevProps, nextProps) => {
  // Custom comparison function to prevent unnecessary re-renders
  return (
    // Compare IDs
    (prevProps.project?.id === nextProps.project?.id) &&
    (prevProps.group?.id === nextProps.group?.id) &&
    // Compare position
    (prevProps.position.x === nextProps.position.x) &&
    (prevProps.position.y === nextProps.position.y) &&
    // Compare state
    (prevProps.isNearCenter === nextProps.isNearCenter) &&
    (prevProps.isDeleted === nextProps.isDeleted) &&
    // Compare contribution data (only check if it exists or changed)
    ((!prevProps.contributionSummary && !nextProps.contributionSummary) ||
     (prevProps.contributionSummary?.total_amount_cents === nextProps.contributionSummary?.total_amount_cents &&
      prevProps.contributionSummary?.contributor_count === nextProps.contributionSummary?.contributor_count))
  );
});

// Helper function to convert hex color to hue-rotation value
function getHueRotation(hexColor: string): string {
  // Normalize the hex color to ensure it's valid
  if (!hexColor || !hexColor.startsWith('#') || hexColor.length !== 7) {
    return '0deg'; // Default to no rotation for invalid colors
  }

  try {
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
  } catch (error) {
    console.error('Error calculating hue rotation:', error);
    return '0deg'; // Fallback to no rotation
  }
} 