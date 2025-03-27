"use client"

import { useMutation } from "@tanstack/react-query"
import { generateId } from "@/lib/id"
import { useEffect, useRef, useState, useMemo } from "react"
import { boundsToGeohash } from "@/lib/geo/geohash"
import { useAuth } from "@clerk/nextjs"
import type { BaseProject, ProjectData, ProjectStatus } from "@/server/types/shared"
import { useServerEvent, WebSocketManager, type ConnectionState } from "./websocket-manager"
import { HydratableDate as Date } from "@/lib/utils"
import { ParkbeatLogger } from "@/lib/logger-types"
import { getLogger } from "@/lib/logger"
// WebSocket payload type with string dates
export type ProjectPayload = BaseProject

// Client-side project type with Date objects
export type Project = Omit<BaseProject, '_meta_updated_at' | '_meta_created_at'> & {
  _meta_updated_at: Date
  _meta_created_at: Date
}

// Contribution summary type
export type ContributionSummary = {
  total_amount_cents: number
  contributor_count: number
  top_contributors?: Array<{
    user_id: string
    amount_cents: number
  }>
}

export type ProjectGroup = {
  id: string
  count: number
  _loc_lat: number
  _loc_lng: number
  city: string
  state: string
}

// Global object to track active project subscriptions across components
const activeProjectSubscriptions = new Map<string, {
  refCount: number;
  subscribers: Set<string>;
}>();

// Debug flag to enable/disable detailed subscription logging
let DEBUG_PROJECT_SUBSCRIPTIONS = true;

// Utility logging function
const logSubscription = (message: string, ...args: any[]) => {
  if (DEBUG_PROJECT_SUBSCRIPTIONS) {
    console.log(`[ProjectSubscription] ${message}`, ...args);
  }
};

// Utility function to get debug information about current subscriptions
export function getActiveProjectSubscriptionsDebugInfo() {
  const info = {
    activeSubscriptions: [] as Array<{
      projectId: string;
      refCount: number;
      subscriberCount: number;
      subscribers: string[];
    }>
  };
  
  activeProjectSubscriptions.forEach((data, projectId) => {
    info.activeSubscriptions.push({
      projectId,
      refCount: data.refCount,
      subscriberCount: data.subscribers.size,
      subscribers: Array.from(data.subscribers)
    });
  });
  
  return info;
}

/**
 * Toggle debug mode for project subscriptions
 * @param enable Optional boolean to explicitly enable or disable. If not provided, toggles current state.
 * @returns The new debug state
 */
export function toggleProjectSubscriptionDebug(enable?: boolean): boolean {
  if (enable !== undefined) {
    DEBUG_PROJECT_SUBSCRIPTIONS = enable;
  } else {
    DEBUG_PROJECT_SUBSCRIPTIONS = !DEBUG_PROJECT_SUBSCRIPTIONS;
  }
  
  console.log(`Project subscription debugging: ${DEBUG_PROJECT_SUBSCRIPTIONS ? 'ENABLED' : 'DISABLED'}`);
  
  // Log current subscriptions if enabling debug mode
  if (DEBUG_PROJECT_SUBSCRIPTIONS) {
    const info = getActiveProjectSubscriptionsDebugInfo();
    console.log('Current project subscriptions:', info);
  }
  
  return DEBUG_PROJECT_SUBSCRIPTIONS;
}

// Update useLiveTrees hook to use the WebSocketManager
export function useLiveTrees() {
  const handlerId = useRef(`handler_${generateId()}`);
  const [logger, setLogger] = useState<
    ParkbeatLogger.GroupLogger |
    ParkbeatLogger.Logger |
    typeof console
  >(console);
  const wsManager = useMemo(() => WebSocketManager.getInstance(), []);

  // Main tree storage with O(1) lookup by ID
  const [projectMap, setProjectMap] = useState<Map<string, Project>>(new Map());
  
  // Store contribution summaries separately by project ID
  const [contributionSummaryMap, setContributionSummaryMap] = useState<Map<string, ContributionSummary>>(new Map());
  
  // Store tree groups separately
  const [projectGroups] = useState<ProjectGroup[]>([]);
  
  // Current geohash subscription
  const [currentGeohash, setCurrentGeohash] = useState<string | null>(null);
  
  // Connection state
  const [connectionState, setConnectionState] = useState<ConnectionState>(wsManager.getConnectionState());
  
  const { userId } = useAuth();

  // Use the tree hooks for state updates
  const [newProjectData] = useServerEvent.newProject({} as ProjectPayload);
  const [projectData] = useServerEvent.projectData({ projectId: '', data: { project: {} as ProjectPayload, images: [], suggestions: [] } });
  const [subscribeData] = useServerEvent.subscribe({ geohash: '', shouldSubscribe: true, projects: [] });
  const [deleteProjectData] = useServerEvent.deleteProject({ id: '' });

  // Register handler on mount and handle connection state
  useEffect(() => {
    const newLogger = getLogger().group(
      handlerId.current, handlerId.current, false, false
    ) || console;
    setLogger(newLogger);

    const unsubscribe = wsManager.onStateChange(setConnectionState);

    return () => {
      unsubscribe();
      // Only cleanup if this is the last handler
      setTimeout(() => {
        if (wsManager.getHookCount() === 0) {
          wsManager.cleanup();
        }
      }, 100);
    };
  }, [wsManager]);

  // Handle new tree updates
  useEffect(() => {
    if (!newProjectData || !('id' in newProjectData)) return;
    if (newProjectData.id === "0") return;

    const existingProject = projectMap.get(newProjectData.id);
    const processedProject: Project = {
      ...existingProject,
      ...newProjectData,
      fundraiser_id: "",
      _meta_updated_at: newProjectData._meta_updated_at
        ? new Date(newProjectData._meta_updated_at)
        : new Date(),
      _meta_created_at: newProjectData._meta_created_at
        ? new Date(newProjectData._meta_created_at)
        : new Date(),
    };
    
    setProjectMap(prev => {
      const next = new Map(prev);
      next.set(processedProject.id, processedProject);
      return next;
    });
    
    logger.log('debug', `Project ${processedProject.id} updated in client state via newProject`);
  }, [newProjectData, logger]);

  useEffect(() => {
    if (!projectData || !('projectId' in projectData)) return;
    if (projectData.projectId === "0") return;

    const processedProject: Project = {
      ...projectData.data.project,
      fundraiser_id: projectData.data.project.fundraiser_id || "",
      _meta_updated_at: projectData.data.project._meta_updated_at
        ? new Date(projectData.data.project._meta_updated_at)
        : new Date(),
      _meta_created_at: projectData.data.project._meta_created_at
        ? new Date(projectData.data.project._meta_created_at)
        : new Date(),
    };

    // Update project map
    setProjectMap(prev => {
      const next = new Map(prev);
      next.set(processedProject.id, processedProject);
      return next;
    });
    
    // Update contribution summary map if contribution data exists
    if (projectData.data.contribution_summary) {
      const processedContributionSummary: ContributionSummary = {
        total_amount_cents: parseInt(projectData.data.contribution_summary.total_amount_cents.toString()),
        contributor_count: parseInt(projectData.data.contribution_summary.contributor_count.toString()),
        top_contributors: projectData.data.contribution_summary.top_contributors,
      }

      setContributionSummaryMap(prev => {
        const next = new Map(prev);
        next.set(processedProject.id, processedContributionSummary);
        return next;
      });
    }
  }, [projectData, logger]);
  

  // Handle delete tree updates
  useEffect(() => {
    console.log('[useLiveTrees] deleteProjectData', deleteProjectData)
    if (!deleteProjectData || !('id' in deleteProjectData)) return;
    if (deleteProjectData.id === "0" || !deleteProjectData.id) return;

    setProjectMap(prev => {
      const next = new Map(prev);
      next.delete(deleteProjectData.id);
      return next;
    });

    // Also remove contribution summary when project is deleted
    setContributionSummaryMap(prev => {
      const next = new Map(prev);
      next.delete(deleteProjectData.id);
      return next;
    });

    logger.log('debug', `Project ${deleteProjectData.id} removed from client state via deleteProject`);
  }, [deleteProjectData, logger]);

  // Handle subscription updates
  useEffect(() => {
    if (!subscribeData) return;
    
    const { geohash, projects } = subscribeData;
    setCurrentGeohash(geohash);

    logger.log('info', `[subscribe] Processing subscription data for geohash: ${geohash} (${projects?.length ?? 0} projects)`);

    if (Array.isArray(projects)) {
      const processedProjects: Project[] = projects.map(project => ({
        ...project,
        fundraiser_id: "",
        _meta_updated_at: project._meta_updated_at
          ? new Date(project._meta_updated_at) 
          : new Date(),
        _meta_created_at: project._meta_created_at
          ? new Date(project._meta_created_at)
          : new Date(),
      }));

      setProjectMap(prev => {
        const next = new Map(prev);
        processedProjects.forEach(project => next.set(project.id, project as Project));
        return next;
      });

      // Extract contribution summaries if they exist
      processedProjects.forEach(project => {
        if ('contribution_summary' in project) {
          const contributionSummary = (project as any).contribution_summary;
          if (contributionSummary) {
            setContributionSummaryMap(prev => {
              const next = new Map(prev);
              next.set(project.id, contributionSummary);
              return next;
            });
          }
        }
      });
    }
  }, [subscribeData, logger]);

  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Subscription management
  useEffect(() => {
    const handleBoundsChange = ({ detail: bounds }: CustomEvent<{
      north: number
      south: number
      east: number
      west: number
    }>) => {
      if (timeout.current) {
        clearTimeout(timeout.current);
      }

      timeout.current = setTimeout(async () => {
        // Use stored geohash if available and no current geohash
        const geohash = !currentGeohash && window.currentGeohash ? window.currentGeohash : boundsToGeohash(bounds);
        if (geohash.length < 2) {
          logger.log('debug', 'Geohash too short, skipping subscription: ' + geohash);
          return;
        }

        if (!!geohash && currentGeohash !== geohash) {
          logger.log('debug', `Changing geohash subscription from ${currentGeohash} to ${geohash}`);
          
          if (currentGeohash) {
            wsManager.unsubscribeFromRoom(currentGeohash, 'geohash');
            logger.log('info', `Unsubscribed from geohash: ${currentGeohash}`);
          }
          
          logger.log('info', `Subscribing to geohash: ${geohash}`);
          wsManager.subscribeToRoom(geohash, 'geohash');
          setCurrentGeohash(geohash);
        }
      }, 500);
    };

    window.addEventListener('map:newBounds', handleBoundsChange as EventListener);
    return () => {
      window.removeEventListener('map:newBounds', handleBoundsChange as EventListener);
    };
  }, [currentGeohash]);

  const { mutate: deleteProject, isPending: isDeletePending } = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      await wsManager.emit('deleteProject', { id });
      return { id };
    }
  })

  // Tree mutation handler
  const { mutate: setProject, isPending } = useMutation({
    mutationFn: async (project: Partial<ProjectData['project']> & {
      lat: number
      lng: number
    }) => {
      const {
        id,
        name,
        description,
        lat,
        lng,
        status
      } = project;

      const projectId = id || generateId();
      const now = new Date();
      logger.log('info', `Creating/updating project: ${name} at ${lat},${lng}`);
      
      const newProject: ProjectPayload = {
        ...project,
        id: projectId,
        name: name || "",
        description: description || "",
        status: status || "active",
        category: "other",
        fundraiser_id: "",
        _loc_lat: lat,
        _loc_lng: lng,
        _meta_created_by: userId || "unknown",
        _meta_updated_by: userId || "unknown",
        _meta_created_at: now.toISOString(),
        _meta_updated_at: now.toISOString(),
      };

      // Wait for connection if not connected
      if (wsManager.getConnectionState() !== 'connected') {
        logger.log('info', 'Waiting for WebSocket connection...');
        await new Promise<void>((resolve) => {
          const checkConnection = () => {
            if (wsManager.getConnectionState() === 'connected') {
              resolve();
            } else {
              setTimeout(checkConnection, 100);
            }
          };
          checkConnection();
        });
      }
      
      // Emit with immediate timing
      const success = wsManager.emit('setProject', newProject);
      if (!success) {
        throw new Error('Failed to send project - WebSocket not connected');
      }
      
      return { name, lat, lng, status };
    }
  });

  // Clean up logger on window unload
  useEffect(() => {
    const cleanup = () => {
      // Only cleanup if this is the last handler
      if (wsManager.getHookCount() === 0) {
        //
      }
    };
    window.addEventListener('beforeunload', cleanup);
    return () => {
      window.removeEventListener('beforeunload', cleanup);
      if (currentGeohash) {
        logger.log('info', `Unsubscribing from geohash: ${currentGeohash} via destructor`);
        wsManager.emit('subscribe', {
          geohash: currentGeohash,
          shouldSubscribe: false
        }, { argBehavior: 'replace', uniqueKey: 'geohash' });
        setCurrentGeohash(null);
      }
    };
  }, []);

  return {
    projectMap,
    projectGroups,
    contributionSummaryMap,
    setProject,
    deleteProject,
    isPending,
    isDeletePending,
    connectionState,
    useProjectData
  };
}

// Update useProjectData to use the WebSocketManager
export function useProjectData(projectId: string) {
  const wsManager = useMemo(() => WebSocketManager.getInstance(), []);
  const currentProjectId = useRef<string | null>(null);
  const subscriberId = useRef<string>(generateId());

  const [projectData, setProjectData] = useServerEvent.projectData({
    projectId,
    data: {
      project: {} as ProjectPayload,
      images: [],
      suggestions: []
    }
  });

  useEffect(() => {
    if (currentProjectId.current === projectId) return;

    // Unsubscribe from previous project if needed
    if (currentProjectId.current) {
      logSubscription(`releasing subscription for project ${currentProjectId.current}`);
      
      const subscription = activeProjectSubscriptions.get(currentProjectId.current);
      if (subscription?.subscribers.has(subscriberId.current)) {
        logSubscription(`subscription already exists for project ${currentProjectId.current}`);
        return;
      }
      
      currentProjectId.current = null;
    }

    // Subscribe to new project
    if (projectId) {
      logSubscription(`requested subscription for project ${projectId}`);
      
      // Check if already subscribed
      let subscription = activeProjectSubscriptions.get(projectId);
      
      if (subscription) {
        // Add this subscriber to existing subscription
        subscription.refCount++;
        subscription.subscribers.add(subscriberId.current);
        logSubscription(`adding to existing subscription for ${projectId}`, 
          `(${subscription.refCount} refs, ${subscription.subscribers.size} subscribers)`);
      } else {
        // Create new subscription entry
        subscription = {
          refCount: 1,
          subscribers: new Set([subscriberId.current])
        };
        activeProjectSubscriptions.set(projectId, subscription);
        
        // Actually subscribe via WebSocket
        logSubscription(`creating new subscription for project ${projectId}`);
        wsManager.subscribeToRoom(projectId, 'project');
      }
      
      currentProjectId.current = projectId;
    }
  }, [projectId]);

  // Enhanced cleanup to properly track subscription references
  const disconnect = () => {
    if (!currentProjectId.current) return;
    
    const projectId = currentProjectId.current;
    logSubscription(`disconnect called for project ${projectId}`);
    
    const subscription = activeProjectSubscriptions.get(projectId);
    if (subscription) {
      // Remove this subscriber
      subscription.subscribers.delete(subscriberId.current);
      subscription.refCount--;
      
      // If this was the last subscriber, unsubscribe from the room
      if (subscription.refCount <= 0) {
        logSubscription(`disconnect: last subscriber, unsubscribing from project ${projectId}`);
        wsManager.unsubscribeFromRoom(projectId, 'project');
        activeProjectSubscriptions.delete(projectId);
        // Clear cached state in WebSocketManager to prevent stale data on reconnect
        wsManager.clearLatestState('projectData');
      } else {
        logSubscription(`disconnect: other subscribers remain, keeping subscription active for ${projectId}`, 
          `(${subscription.refCount} refs, ${subscription.subscribers.size} subscribers)`);
      }
    } else {
      // Failsafe - should not happen
      wsManager.unsubscribeFromRoom(projectId, 'project');
    }
    
    // Reset projectData
    setProjectData({
      projectId,
      data: {
        project: {} as ProjectPayload,
        images: [],
        suggestions: []
      }
    });
    
    currentProjectId.current = null;
  };

  // Ensure cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []);

  return {
    projectData,
    disconnect
  };
}
