"use client"

import { useMutation } from "@tanstack/react-query"
import { generateId } from "@/lib/id"
import { useEffect, useRef, useState, useMemo } from "react"
import { boundsToGeohash } from "@/lib/geo/geohash"
import { useAuth } from "@clerk/nextjs"
import { WebSocketLogger } from "./client-log"
import type { BaseProject, ProjectStatus } from "@/server/routers/socket/project-handlers"
import { useServerEvent, WebSocketManager, type ConnectionState } from "./websocket-manager"

// WebSocket payload type with string dates
export type ProjectPayload = BaseProject

// Client-side project type with Date objects
export type Project = Omit<BaseProject, '_meta_updated_at' | '_meta_created_at'> & {
  _meta_updated_at: Date
  _meta_created_at: Date
}

export type ProjectGroup = {
  id: string
  count: number
  _loc_lat: number
  _loc_lng: number
  city: string
  state: string
}

// Update useLiveTrees hook to use the WebSocketManager
export function useLiveTrees() {
  const handlerId = useRef(`handler_${generateId()}`);
  const logger = useMemo(() => WebSocketLogger.getInstance(), []);
  const wsManager = useMemo(() => WebSocketManager.getInstance(), []);

  // Main tree storage with O(1) lookup by ID
  const [projectMap, setProjectMap] = useState<Map<string, Project>>(new Map());
  
  // Store tree groups separately
  const [projectGroups, setProjectGroups] = useState<ProjectGroup[]>([]);
  
  // Current geohash subscription
  const [currentGeohash, setCurrentGeohash] = useState<string | null>(null);
  
  // Connection state
  const [connectionState, setConnectionState] = useState<ConnectionState>(wsManager.getConnectionState());
  
  const { userId } = useAuth();

  // Use the tree hooks for state updates
  const [newProjectData] = useServerEvent.newProject({} as ProjectPayload);
  const [subscribeData] = useServerEvent.subscribe({ geohash: '', shouldSubscribe: true, projects: [] });
  const [deleteProjectData] = useServerEvent.deleteProject({ id: '' });

  // Register handler on mount and handle connection state
  useEffect(() => {
    logger.registerHandler(handlerId.current);

    const unsubscribe = wsManager.onStateChange(setConnectionState);

    return () => {
      logger.unregisterHandler(handlerId.current);
      unsubscribe();
      // Only cleanup if this is the last handler
      if (wsManager.getHookCount() === 0) {
        wsManager.cleanup();
      }
    };
  }, [logger, wsManager]);

  // Handle new tree updates
  useEffect(() => {
    console.log('[useLiveTrees] newProjectData', newProjectData)
    if (!newProjectData || !('id' in newProjectData)) return;
    if (newProjectData.id === "0") return;

    const processedProject: Project = {
      ...newProjectData,
      _meta_updated_at: new Date(newProjectData._meta_updated_at),
      _meta_created_at: new Date(newProjectData._meta_created_at)
    };
    
    setProjectMap(prev => {
      const next = new Map(prev);
      next.set(processedProject.id, processedProject);
      return next;
    });
    
    logger.log('debug', `Project ${processedProject.id} updated in client state via newProject`);
  }, [newProjectData, logger]);

  // Handle delete tree updates
  useEffect(() => {
    console.log('[useLiveTrees] deleteProjectData', deleteProjectData)
    if (!deleteProjectData || !('id' in deleteProjectData)) return;
    if (deleteProjectData.id === "0") return;

    setProjectMap(prev => {
      const next = new Map(prev);
      next.delete(deleteProjectData.id);
      return next;
    });

    logger.log('debug', `Project ${deleteProjectData.id} removed from client state via deleteProject`);
  }, [deleteProjectData, logger]);

  // Handle subscription updates
  useEffect(() => {
    console.log('\n\n[useLiveTrees] subscribeData', subscribeData)
    if (!subscribeData) return;
    
    const { geohash, projects } = subscribeData;
    setCurrentGeohash(geohash);

    logger.log('info', `[subscribe] Processing subscription data for geohash: ${geohash} (${projects?.length ?? 0} projects)`);

    if (Array.isArray(projects)) {
      const processedProjects = projects.map(project => ({
        ...project,
        _meta_updated_at: new Date(project._meta_updated_at),
        _meta_created_at: new Date(project._meta_created_at)
      }));

      setProjectMap(prev => {
        const next = new Map(prev);
        processedProjects.forEach(project => next.set(project.id, project));
        return next;
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
            await wsManager.emit('subscribe', {
              geohash: currentGeohash,
              shouldSubscribe: false
            }, { argBehavior: 'replace', uniqueKey: 'geohash' });
            logger.log('info', `Unsubscribed from geohash: ${currentGeohash}`);
          }
          
          logger.log('info', `Subscribing to geohash: ${geohash}`);
          await wsManager.emit('subscribe', {
            geohash,
            shouldSubscribe: true
          }, { argBehavior: 'replace', uniqueKey: 'geohash' });
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
    mutationFn: async ({
      id,
      name,
      description,
      lat,
      lng,
      status
    }: {
      id?: string
      name: string
      description?: string
      lat: number
      lng: number
      status: ProjectStatus
    }) => {
      const projectId = id || generateId();
      const now = new Date();
      logger.log('info', `Creating/updating project: ${name} at ${lat},${lng}`);
      
      const newProject: ProjectPayload = {
        id: projectId,
        name,
        description,
        status,
        _loc_lat: lat,
        _loc_lng: lng,
        _meta_created_by: userId || "unknown",
        _meta_updated_by: userId || "unknown",
        _meta_created_at: now.toISOString(),
        _meta_updated_at: now.toISOString()
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
        logger.cleanup();
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

  const [projectData] = useServerEvent.projectData({
    projectId,
    data: {
      project: {} as ProjectPayload,
      images: [],
      suggestions: []
    }
  });

  useEffect(() => {
    if (projectId) {
      wsManager.subscribeToProject(projectId);
    }
    return () => {
      wsManager.unsubscribeFromProject(projectId);
    }
  }, [projectId, wsManager]);

  return projectData;
}
