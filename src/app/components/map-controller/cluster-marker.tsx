'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { Project, ProjectGroup } from '@/hooks/use-tree-sockets'
import type maplibregl from 'maplibre-gl'
import { cn } from '@/lib/utils'
import { ClusterInfoPanel } from './cluster-info-panel'

interface ClusterMarkerProps {
  cluster: {
    id: string
    position: { x: number; y: number }
    projectIds: string[]
    isNearCenter: boolean
  }
  projects: Project[]
  projectGroups?: ProjectGroup[]
  map: maplibregl.Map
  focusedMarkerId: string | null
}

// Get a special filter for cluster markers
function getClusterMarkerFilter(): string {
  // Purple/violet tint to distinguish from regular markers
  return "hue-rotate(30deg) saturate(0.4) brightness(1.05) drop-shadow(0 2px 3px rgba(0, 0, 0, 0.2))";
}

export const ClusterMarker = ({ 
  cluster, 
  projects, 
  projectGroups, 
  map, 
  focusedMarkerId 
}: ClusterMarkerProps) => {
  const [showInfoPanel, setShowInfoPanel] = useState(false)
  const [isPanelLoading, setIsPanelLoading] = useState(false)
  const clusterLoadTimeRef = useRef<number | null>(null)
  
  // Filter projects that are in this cluster
  const projectsInCluster = projects.filter(p => 
    cluster.projectIds.includes(p.id)
  )

  // Filter project groups that are in this cluster
  const groupsInCluster = (projectGroups || []).filter(g => 
    cluster.projectIds.includes(g.id)
  )

  // Find the statuses of all projects in the cluster
  const statusCounts = projectsInCluster.reduce((acc, project) => {
    const status = project.status || 'unknown';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Calculate total number of projects (individual + in groups)
  const totalProjects = projectsInCluster.length + 
    groupsInCluster.reduce((sum, group) => sum + (group.count || 0), 0);

  useEffect(() => {
    // Show info panel when near center
    if (cluster.isNearCenter && focusedMarkerId === cluster.id && !showInfoPanel) {
      clusterLoadTimeRef.current = performance.now();
      setIsPanelLoading(true);
      setShowInfoPanel(true);
      
      // Artificial short delay to avoid panel flickering
      const timeout = setTimeout(() => {
        setIsPanelLoading(false);
      }, 100);
      
      return () => clearTimeout(timeout);
    }

    if (!cluster.isNearCenter || focusedMarkerId !== cluster.id) {
      setShowInfoPanel(false);
      setIsPanelLoading(false);
      clusterLoadTimeRef.current = null;
    }
  }, [cluster.isNearCenter, focusedMarkerId, cluster.id, showInfoPanel]);

  // Additional styling for clusters that are near center
  const isClusterFocused = cluster.isNearCenter && focusedMarkerId === cluster.id;

  return (
    <>
      {createPortal(
        <ClusterInfoPanel
          cluster={cluster}
          projects={projectsInCluster}
          groups={groupsInCluster} 
          position={cluster.position}
          isVisible={showInfoPanel}
          isLoading={isPanelLoading}
          totalProjects={totalProjects}
          statusCounts={statusCounts}
        />,
        map.getCanvasContainer()
      )}
      <div 
        className={cn(
          "pointer-events-auto",
          isClusterFocused ? "z-10" : "z-0"
        )}
        style={{ 
          position: 'absolute',
          transform: `translate(${cluster.position.x}px, ${cluster.position.y}px)`,
        }}
      >
        <button
          className={cn(
            "project-marker-button",
            isClusterFocused && "highlighted"
          )}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            
            // Get the average coordinates of all projects in cluster
            const clusterItems = [...projectsInCluster, ...groupsInCluster];
            
            if (clusterItems.length === 0) return;
            
            const avgLat = clusterItems.reduce((sum, p) => sum + p._loc_lat, 0) / clusterItems.length;
            const avgLng = clusterItems.reduce((sum, p) => sum + p._loc_lng, 0) / clusterItems.length;
            
            // Zoom in to break up the cluster
            const currentZoom = map.getZoom();
            map.flyTo({
              center: [avgLng, avgLat],
              zoom: Math.min(currentZoom + 1.5, 16), // Increase zoom to break up the cluster
              duration: 1000,
              essential: true
            });
          }}
        >
          <div className="relative group cursor-pointer">
            <div className="project-marker-container duration-200 ease-out group-hover:scale-110">
              <div className="relative"
                style={{
                  filter: getClusterMarkerFilter(),
                }}
              >
                <img 
                  src="/pin-green.svg"
                  alt="Project Cluster" 
                  className="min-w-12 h-12"
                />
                {/* Cluster icon */}
                <div className={cn(
                  "absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-[80%]",
                  "text-[#18351F]"
                )}>
                  <i className="fa-solid fa-layer-group text-sm" />
                </div>
                
                {/* Badge with number of projects */}
                <div className={cn(
                  "absolute top-1/2 -translate-y-[80%] left-1/2 -translate-x-1/2 bg-red-500 text-white",
                  "rounded-full min-w-6 h-6 flex items-center justify-center text-xs font-semibold",
                  "border-2 border-white shadow-md transform transition-all",
                  "dark:border-gray-800",
                  "px-1.5"
                )}>
                  {cluster.projectIds.length}
                </div>
              </div>
            </div>
          </div>
        </button>
      </div>
    </>
  );
}; 