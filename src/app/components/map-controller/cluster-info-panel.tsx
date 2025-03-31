import { cn } from '@/lib/utils'
import { capitalize } from '@/lib/str'
import type { Project, ProjectGroup } from '@/hooks/use-tree-sockets'
import { useState } from 'react'

interface ClusterInfoPanelProps {
  cluster: {
    id: string
    position: { x: number; y: number }
    projectIds: string[]
    isNearCenter: boolean
  }
  projects: Project[]
  groups: ProjectGroup[]
  position: { x: number; y: number }
  isVisible: boolean
  isLoading?: boolean
  className?: string
  totalProjects: number
  statusCounts: Record<string, number>
}

// Color mapping for status
const statusColors: Record<string, string> = {
  draft: 'bg-orange-100 text-orange-800',
  active: 'bg-green-100 text-green-800',
  funded: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-blue-100 text-blue-800',
  archived: 'bg-gray-100 text-gray-800',
  unknown: 'bg-gray-100 text-gray-600',
}

export const ClusterInfoPanel = ({ 
  cluster, 
  projects, 
  groups, 
  position, 
  isVisible, 
  isLoading = false, 
  className,
  totalProjects,
  statusCounts
}: ClusterInfoPanelProps) => {
  const [expanded, setExpanded] = useState(false);
  
  // Get the most common location for the cluster title
  const getLocationText = () => {
    // Try to find the most common city/state combination
    const locationCounts: Record<string, number> = {};
    
    // Count projects by location - assume projects might have _loc_lat/_loc_lng but not city/state explicitly
    projects.forEach(project => {
      // Instead of accessing non-existent properties, use a default location for projects
      // based on their ID or treat them as coordinates only
      const location = 'Project Location';
      locationCounts[location] = (locationCounts[location] || 0) + 1;
    });
    
    // Count groups by location
    groups.forEach(group => {
      const city = group.city || '';
      const state = group.state || '';
      const location = [city, state].filter(Boolean).join(', ');
      if (location) {
        locationCounts[location] = (locationCounts[location] || 0) + 1;
      }
    });
    
    // Find the most common location
    let mostCommonLocation = 'Multiple Locations';
    let maxCount = 0;
    
    Object.entries(locationCounts).forEach(([location, count]) => {
      if (count > maxCount) {
        maxCount = count;
        mostCommonLocation = location;
      }
    });
    
    return mostCommonLocation || 'Unknown Location';
  };

  // If panel is not visible, don't render anything
  if (!isVisible) return null;

  return (
    <div 
      className={cn(
        "tree-info-panel frosted-glass",
        className,
        "text-zinc-800 dark:text-zinc-50",
        "cursor-pointer hover:scale-[1.02] active:scale-[0.98]",
        isLoading && "navigating"
      )}
      style={{ 
        position: 'absolute',
        left: position.x,
        top: position.y - 8,
        transform: `translate(-50%, calc(-100% - 48px))`,
        width: '280px',
        opacity: isVisible ? 1 : 0,
        transition: 'opacity 150ms ease-in-out',
      }}
      onClick={() => setExpanded(!expanded)}
    >
      {isLoading ? (
        <div className="p-2 flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded-full w-24 animate-pulse"></div>
            <div className="h-6 w-6 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse"></div>
          </div>
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-3/4 animate-pulse"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full animate-pulse mt-2"></div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div className="tree-status bg-amber-100 text-amber-800">
              <i className="fa-solid fa-layer-group" />
              {cluster.projectIds.length} marker{cluster.projectIds.length !== 1 ? 's' : ''}
            </div>
            
            <div 
              className={cn(
                "tree-status bg-emerald-100 text-emerald-800",
                "flex items-center space-x-1"
              )}
            >
              <i className="fa-solid fa-trees" />
              <span>{totalProjects} project{totalProjects !== 1 ? 's' : ''}</span>
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="tree-name">
              {getLocationText()}
            </div>
            
            {/* Toggle expansion icon */}
            <div
              className={cn(
                "text-zinc-500 dark:text-zinc-400",
                "w-6 h-6 flex items-center justify-center"
              )}
              aria-hidden="true"
            >
              <i className={cn(
                "fa-solid text-sm",
                expanded ? "fa-chevron-up" : "fa-chevron-down"
              )} />
            </div>
          </div>
          
          {/* Status distribution */}
          <div className="mt-2 text-xs">
            <div className="flex items-center space-x-1 text-muted-foreground mb-1">
              <i className="fa-solid fa-chart-pie text-xs" />
              <span>Project distribution:</span>
            </div>
            
            {/* Status bars visualization */}
            <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden flex">
              {Object.entries(statusCounts)
                .sort(([statusA], [statusB]) => {
                  // Sort by status priority: active, funded, completed, draft, archived
                  const statusPriority = {
                    'active': 1,
                    'funded': 2,
                    'completed': 3,
                    'draft': 4,
                    'archived': 5,
                    'unknown': 6
                  };
                  return (statusPriority[statusA as keyof typeof statusPriority] || 99) - 
                         (statusPriority[statusB as keyof typeof statusPriority] || 99);
                })
                .map(([status, count]) => {
                  // Calculate the percentage based on total projects
                  const totalProjectCount = Object.values(statusCounts).reduce((sum, count) => sum + count, 0);
                  const percentage = totalProjectCount > 0 ? (count / totalProjectCount) * 100 : 0;
                  const statusColorClass = status && statusColors[status] 
                    ? statusColors[status].split(' ')[0] 
                    : 'bg-gray-300';
                  
                  return (
                    <div 
                      key={status} 
                      className={statusColorClass}
                      style={{ width: `${percentage}%` }}
                      title={`${capitalize(status)}: ${count} projects (${Math.round(percentage)}%)`}
                    />
                  );
                })}
            </div>
            
            <div className="flex flex-wrap gap-1 mt-1.5">
              {Object.entries(statusCounts).map(([status, count]) => (
                <div 
                  key={status}
                  className={cn(
                    "px-2 py-0.5 rounded-full text-xs",
                    statusColors[status] || statusColors.unknown
                  )}
                >
                  <i className={cn(
                    "fa-solid mr-1 text-xs",
                    {
                      'fa-seedling': status === 'draft',
                      'fa-money-bills': status === 'active',
                      'fa-tree': status === 'funded',
                      'fa-check-circle': status === 'completed',
                      'fa-archive': status === 'archived',
                      'fa-circle-question': status === 'unknown'
                    }
                  )} />
                  {capitalize(status)}: {count}
                </div>
              ))}
            </div>
          </div>
          
          {/* Expanded project list */}
          {expanded && (
            <div className="mt-3 border-t border-gray-200 dark:border-zinc-700 pt-2">
              <div className="text-xs font-medium mb-1">Projects in this cluster:</div>
              <div className="max-h-[120px] overflow-y-auto">
                <ul className="text-xs space-y-1">
                  {/* List projects */}
                  {projects.map(project => {
                    // Manually handle the nullable status
                    const status = project?.status || 'unknown';
                    const statusColor = statusColors[status] ? statusColors[status].split(' ')[0] : 'bg-gray-300';
                    
                    return (
                      <li key={project.id} className="flex items-center hover:bg-gray-100 dark:hover:bg-zinc-800 rounded p-1">
                        <div 
                          className={cn(
                            "w-2 h-2 rounded-full mr-2",
                            statusColor
                          )}
                        />
                        <span className="truncate">{project.name || 'Unnamed Project'}</span>
                      </li>
                    );
                  })}
                  
                  {/* List groups */}
                  {groups.map(group => (
                    <li key={group.id} className="flex items-center hover:bg-gray-100 dark:hover:bg-zinc-800 rounded p-1">
                      <div className="w-2 h-2 rounded-full bg-emerald-300 mr-2" />
                      <span className="truncate">
                        {group.count} trees in {[group.city, group.state].filter(Boolean).join(', ') || 'Unknown Location'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300 p-1.5 rounded-md text-xs">
                <i className="fa-solid fa-info-circle mr-1" />
                Click on the marker to zoom in and break up this cluster.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}; 