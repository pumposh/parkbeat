'use client'

import { useState, useEffect, useRef, useMemo, memo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import type { Project, ProjectGroup, ContributionSummary } from '@/hooks/use-tree-sockets'
import type maplibregl from 'maplibre-gl'
import { ProjectMarker } from './project-marker'
import { ClusterMarker } from './cluster-marker'
import { cn } from '@/lib/utils'

const PROXIMITY_THRESHOLD = 50; // pixels
const CLUSTER_DISTANCE = 80; // pixels distance for clustering

interface MarkersProps {
  projects: Project[]
  projectGroups?: ProjectGroup[]
  map?: maplibregl.Map
  onMarkerNearCenter: (isNear: boolean) => void
  contributionSummaryMap?: Map<string, ContributionSummary>
}

interface Marker {
  position: { x: number; y: number }
  isNearCenter: boolean
  isDeleted?: boolean
}

interface Cluster {
  id: string
  position: { x: number; y: number }
  projectIds: string[]
  isNearCenter: boolean
}

// Type guard function to check if a project has valid location data
function hasValidLocation(project: Project | ProjectGroup | undefined): project is Project | ProjectGroup {
  return !!project && 
         typeof project._loc_lat === 'number' && !isNaN(project._loc_lat) && 
         typeof project._loc_lng === 'number' && !isNaN(project._loc_lng);
}

// Wrap with memo for better performance
const UnmemoizedMarkers = ({ projects, projectGroups, map, onMarkerNearCenter, contributionSummaryMap }: MarkersProps) => {
  if (!map) return null;

  const [markers, setMarkers] = useState<{ [key: string]: Marker }>({})
  const [groupMarkers, setGroupMarkers] = useState<{ [key: string]: Marker }>({})
  const [clusters, setClusters] = useState<Cluster[]>([])
  const [singleMarkerIds, setSingleMarkerIds] = useState<string[]>([])
  const mapCenter = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const [focusedMarkerId, setFocusedMarkerId] = useState<string | null>(null)
  
  // Memoize the updateMarkerPositions function to prevent recreation on each render
  const updateMarkerPositions = useCallback((onMove?: boolean) => {
    const newMarkers: typeof markers = {}
    const newGroupMarkers: typeof groupMarkers = {}
    if (!map) return;
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
      if (!map) return;
      if (isNaN(project._loc_lat) || isNaN(project._loc_lng)) return
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

    // Create list of deleted markers - looking at the current state
    const currentMarkers = new Map(Object.entries(markers));
    const currentGroupMarkers = new Map(Object.entries(groupMarkers));
    
    // Remove markers that still exist
    [...projects, ...(projectGroups || [])].forEach(project => {
      currentMarkers.delete(project.id);
      currentGroupMarkers.delete(project.id);
    });

    // Mark remaining as deleted
    const deletedMarkers = Array.from(currentMarkers.entries())
      .map(([id, marker]) => ({ id, ...marker, isDeleted: true }))
    const deletedGroupMarkers = Array.from(currentGroupMarkers.entries())
      .map(([id, marker]) => ({ id, ...marker, isDeleted: true }))

    // Add deleted markers back to the collections
    deletedMarkers.forEach(({ id, ...marker }) => {
      newMarkers[id] = marker;
    });
    
    deletedGroupMarkers.forEach(({ id, ...marker }) => {
      newGroupMarkers[id] = marker;
    });
    
    // Schedule removal of deleted markers
    if (deletedMarkers.length > 0 || deletedGroupMarkers.length > 0) {
      setTimeout(() => {
        const deletedKeys = [
          ...deletedMarkers.map(({ id }) => id),
          ...deletedGroupMarkers.map(({ id }) => id)
        ]
        setMarkers(prev => {
          const next = { ...prev };
          deletedKeys.forEach(id => {
            if (next[id]) delete next[id];
          });
          return next;
        });
        
        setGroupMarkers(prev => {
          const next = { ...prev };
          deletedKeys.forEach(id => {
            if (next[id]) delete next[id];
          });
          return next;
        });
      }, 300)
    }

    // Only update focused marker if it's near center
    const finalFocusedMarkerId = isAnyMarkerNearCenter ? closestMarkerId : null;
    setFocusedMarkerId(finalFocusedMarkerId);
    
    // Update markers with new positions
    setMarkers(prev => ({...prev, ...newMarkers}));
    setGroupMarkers(prev => ({...prev, ...newGroupMarkers}));
    
    // Do client-side clustering based on zoom level and marker proximity
    if (map) {
      const zoom = map.getZoom();
      
      // Adjust cluster distance based on zoom level
      const clusterDistance = CLUSTER_DISTANCE;
      
      // If zoom is very high, don't cluster
      if (zoom > 16) {
        setClusters([]);
        setSingleMarkerIds([...projects, ...(projectGroups || [])].map(p => p.id));
        onMarkerNearCenter(isAnyMarkerNearCenter);
        return;
      }
      
      // Collect all valid markers (both projects and groups)
      const allProjectsWithMarkers: Array<{
        id: string;
        position: { x: number; y: number };
        isNearCenter: boolean;
      }> = [];
      
      // First collect all project markers
      projects.forEach(project => {
        if (project && project.id && newMarkers[project.id]) {
          allProjectsWithMarkers.push({
            id: project.id,
            position: newMarkers[project.id]!.position,
            isNearCenter: newMarkers[project.id]!.isNearCenter
          });
        }
      });
      
      // Then collect all group markers
      (projectGroups || []).forEach(group => {
        if (group && group.id && newGroupMarkers[group.id]) {
          allProjectsWithMarkers.push({
            id: group.id,
            position: newGroupMarkers[group.id]!.position,
            isNearCenter: newGroupMarkers[group.id]!.isNearCenter
          });
        }
      });
      
      // Sort by y-position for optimization
      allProjectsWithMarkers.sort((a, b) => a.position.y - b.position.y);
      
      // Now create clusters
      const newClusters: Cluster[] = [];
      const assignedToCluster = new Set<string>();
      
      for (let i = 0; i < allProjectsWithMarkers.length; i++) {
        const marker = allProjectsWithMarkers[i]!;
        
        // Skip if already in a cluster
        if (assignedToCluster.has(marker.id)) continue;
        
        // Start a new cluster
        const clusterMarkers = [marker];
        assignedToCluster.add(marker.id);
        
        // Check other markers for proximity
        for (let j = i + 1; j < allProjectsWithMarkers.length; j++) {
          const otherMarker = allProjectsWithMarkers[j]!;
          
          // Skip if already in a cluster
          if (assignedToCluster.has(otherMarker.id)) continue;
          
          // Break early if y-distance is too large (optimization)
          if (otherMarker.position.y - marker.position.y > clusterDistance) break;
          
          // Calculate distance
          const dx = otherMarker.position.x - marker.position.x;
          const dy = otherMarker.position.y - marker.position.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          // Add to cluster if close enough
          if (distance <= clusterDistance) {
            clusterMarkers.push(otherMarker);
            assignedToCluster.add(otherMarker.id);
          }
        }
        
        // If we have multiple markers, create a cluster
        if (clusterMarkers.length > 1) {
          // Calculate average position
          const avgX = clusterMarkers.reduce((sum, m) => sum + m.position.x, 0) / clusterMarkers.length;
          const avgY = clusterMarkers.reduce((sum, m) => sum + m.position.y, 0) / clusterMarkers.length;
          
          // A cluster is near center if ANY of its markers is near center
          const isAnyMarkerNearCenter = clusterMarkers.some(m => m.isNearCenter);
          
          newClusters.push({
            id: `cluster-${i}`,
            position: { x: avgX, y: avgY },
            projectIds: clusterMarkers.map(m => m.id),
            isNearCenter: isAnyMarkerNearCenter
          });
        } else {
          // If only one marker, unassign it
          assignedToCluster.delete(marker.id);
        }
      }
      
      // Get remaining single markers
      const newSingleMarkers = [...projects, ...(projectGroups || [])]
        .filter(p => p && p.id && !assignedToCluster.has(p.id))
        .map(p => p.id);
      
      // Now update the focused marker ID based on the new clusters
      let markerIdToUse: string | null = finalFocusedMarkerId;
      if (finalFocusedMarkerId) {
        // Check if our closest marker is part of a cluster
        const cluster = newClusters.find(c => 
          finalFocusedMarkerId && c.projectIds.includes(finalFocusedMarkerId)
        );
        if (cluster) {
          // If so, use the cluster ID instead
          markerIdToUse = cluster.id;
        }
      }

      setClusters(newClusters);
      setSingleMarkerIds(newSingleMarkers);
      setFocusedMarkerId(markerIdToUse);
    }
    
    onMarkerNearCenter(isAnyMarkerNearCenter)
  }, [projects, projectGroups, map, onMarkerNearCenter]);

  // Use the useCallback version in the effect
  useEffect(() => {
    updateMarkerPositions();

    const updateOnMove = () => updateMarkerPositions(true);
    
    if (map) {
      map.on('move', updateOnMove);
      map.on('zoom', updateOnMove);
    }

    return () => {
      if (map) {
        map.off('move', updateOnMove);
        map.off('zoom', updateOnMove);
      }
    };
  }, [updateMarkerPositions, map]);

  // Memoize filtered projects for cluster and project rendering
  const filteredClusterProjects = useMemo(() => 
    clusters.map(cluster => ({
      cluster,
      filteredProjects: projects.filter(p => cluster.projectIds.includes(p.id)),
      filteredGroups: (projectGroups || []).filter(g => cluster.projectIds.includes(g.id))
    })),
    [clusters, projects, projectGroups]
  );

  const filteredSingleProjects = useMemo(() => 
    projects.filter(project => singleMarkerIds.includes(project.id)),
    [projects, singleMarkerIds]
  );

  const filteredSingleGroups = useMemo(() => 
    (projectGroups || []).filter(group => singleMarkerIds.includes(group.id)),
    [projectGroups, singleMarkerIds]
  );

  return createPortal(
    <div className="absolute inset-0 pointer-events-none">
      {/* Render cluster markers */}
      {filteredClusterProjects.map(({ cluster, filteredProjects, filteredGroups }) => {
        if (!map) return null;
        return (
          <ClusterMarker 
            key={cluster.id}
            cluster={cluster}
            projects={filteredProjects}
            projectGroups={filteredGroups}
            map={map}
            focusedMarkerId={focusedMarkerId}
          />
        );
      })}

      {/* Render project group markers that are not part of clusters */}
      {filteredSingleGroups.map(group => {
        const marker = groupMarkers[group.id];
        if (!marker || !map) return null;
        return (
          <ProjectMarker
            key={group.id}
            group={group}
            isDeleted={marker.isDeleted}
            position={marker.position}
            isNearCenter={marker.isNearCenter && focusedMarkerId === group.id}
            map={map}
          />
        );
      })}

      {/* Render individual project markers that are not part of clusters */}
      {filteredSingleProjects.map(project => {
        if (!map) return null;
        const marker = markers[project.id];
        if (!marker) return null;
        const contributionSummary = contributionSummaryMap?.get(project.id)
        return (
          <ProjectMarker
            key={project.id}
            project={project}
            isDeleted={marker.isDeleted}
            position={marker.position}
            isNearCenter={marker.isNearCenter && focusedMarkerId === project.id}
            map={map}
            contributionSummary={contributionSummary}
          />
        );
      })}
    </div>,
    map.getCanvasContainer()
  )
}

// Export memoized component
export const Markers = memo(UnmemoizedMarkers, (prevProps, nextProps) => {
  // Basic length check for collections that would trigger re-renders
  if (
    prevProps.projects.length !== nextProps.projects.length ||
    (prevProps.projectGroups?.length || 0) !== (nextProps.projectGroups?.length || 0)
  ) {
    return false;
  }
  
  // Check if any projects have been updated (via WebSocket)
  // This is crucial - we need to check timestamps to catch updates
  for (let i = 0; i < prevProps.projects.length; i++) {
    const prevProject = prevProps.projects[i];
    
    // Skip if prevProject is undefined (should never happen, but for type safety)
    if (!prevProject) continue;
    
    const nextProject = nextProps.projects.find(p => p?.id === prevProject.id);
    
    // If we can't find the matching project in the next props, consider it changed
    if (!nextProject) return false;
    
    if (
      prevProject.id !== nextProject.id ||
      prevProject.name !== nextProject.name ||
      prevProject.status !== nextProject.status ||
      prevProject._meta_updated_at?.getTime() !== nextProject._meta_updated_at?.getTime()
    ) {
      return false;
    }
  }
  
  // Check if contribution data has changed
  if (prevProps.contributionSummaryMap && nextProps.contributionSummaryMap) {
    // Fast check: different number of entries
    if (prevProps.contributionSummaryMap.size !== nextProps.contributionSummaryMap.size) {
      return false;
    }
    
    // Check if any contribution data has changed
    for (const [id, prevSummary] of prevProps.contributionSummaryMap.entries()) {
      const nextSummary = nextProps.contributionSummaryMap.get(id);
      if (!nextSummary) return false;
      
      if (
        prevSummary.total_amount_cents !== nextSummary.total_amount_cents ||
        prevSummary.contributor_count !== nextSummary.contributor_count
      ) {
        return false;
      }
    }
  }
  
  // Same map reference
  if (prevProps.map !== nextProps.map) {
    return false;
  }
  
  return true;
}); 