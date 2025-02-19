"use client"

import { useMutation } from "@tanstack/react-query"
import { client } from "@/lib/client"
import { generateId } from "@/lib/id"
import type { 
  ClientEvents,
  ServerEvents,
} from "@/server/routers/tree-router"
import { useEffect, useRef, useState, useMemo, Dispatch } from "react"
import { boundsToGeohash } from "@/lib/geo/geohash"
import { useAuth } from "@clerk/nextjs"
import { WebSocketLogger } from "./client-log"
import type { BaseProject, ProjectStatus } from "@/server/routers/socket/project-handlers"

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

// Connection state management
type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

type ClientSocket = ReturnType<typeof client.tree.live.$ws>

type EventName = keyof (ClientEvents & ServerEvents);
type ServerEventName = keyof ServerEvents;

type EventPayloadMap = ClientEvents & ServerEvents;

// Update ExpectedArgument type to use the EventPayloadMap
type ExpectedArgument<T extends keyof EventPayloadMap> = T extends keyof EventPayloadMap ? EventPayloadMap[T] : never;

type Hook<T extends ServerEventName> = (val: ExpectedArgument<T>) => void;
type HookMap<T extends ServerEventName> = Map<T, Set<Hook<T>>>;
type HookCache<T extends ServerEventName> = Map<T, ExpectedArgument<T>>;

const noop = () => {}

type EmissionOptions = {
  argBehavior?: 'append' | 'replace';
  timing?: 'immediate' | 'delayed';
}

// WebSocket connection manager
class WebSocketManager {
  static getInstance(): WebSocketManager {
    if (!WebSocketManager.instance) {
      console.log('[WebSocketManager] Creating new singleton instance');
      WebSocketManager.instance = new WebSocketManager();
    }
    return WebSocketManager.instance;
  }

  private static instance: WebSocketManager | null = null;
  private ws: ClientSocket | null = null;
  private hooks: HookMap<ServerEventName> | null = null;
  private hookCache: HookCache<ServerEventName> | null = null;
  private connectionState: ConnectionState = 'disconnected';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private eventBuffer: Array<{
    event: keyof ClientEvents;
    data: ExpectedArgument<keyof ClientEvents>;
    options: EmissionOptions
  }> = [];
  private stateListeners: Set<(state: ConnectionState) => void> = new Set();
  private projectSubscriptions: Set<string> = new Set();
  
  // Create a stable reference for the emit queue
  private emitQueueRef: {
    current: Partial<{
      [K in EventName]: {
        timeout: ReturnType<typeof setTimeout> | null;
        args: Set<ExpectedArgument<K>>;
      }
    }>
  } = { current: {} };

  // Add a new map to track the latest state for each event type
  private latestState: Map<EventName, ExpectedArgument<EventName>> = new Map();

  private constructor() {
    console.log('[WebSocketManager] Instance created');
  }
  private connectWs() {
    console.log('[WebSocketManager] Attempting to connect WebSocket');
    if (this.connectionState === 'connecting') {
      console.log('[WebSocketManager] Already connecting, skipping connect');
      return;
    }

    if (this.ws?.isConnected) {
      console.log('[WebSocketManager] WebSocket already connected');
      return;
    }

    this.setConnectionState('connecting');
    this.ws = client.tree.live.$ws();
    console.log('[WebSocketManager] Setting up WebSocket event handlers');
    
    // System events
    this.ws.on('onConnect', () => {
      console.log('[WebSocketManager] WebSocket connected successfully');
      this.setConnectionState('connected');
      this.reconnectAttempts = 0;
      if (this.eventBuffer.length > 0) {
        console.log(`[WebSocketManager] Flushing ${this.eventBuffer.length} buffered events`);
      }
      this.flushEventBuffer();
    });

    this.ws.on('onError', (error: Error) => {
      console.error('[WebSocketManager] WebSocket error:', error);
      this.handleDisconnect();
    });

    this.ws.on('pong', noop);

    // Initialize all possible events with no-op handlers
    const eventNames: (keyof ServerEvents)[] = ['newProject', 'subscribe', 'projectData'];
    eventNames.forEach(eventName => {
      this.ws?.on(eventName, (_arg) => {
        console.log(`[WebSocketManager] Received ${eventName} event from server`);
        if (eventName === 'pong') {
          noop();
          return;
        }

        // For non-system events, process through hook system if hooks exist
        if (this.hooks?.has(eventName)) {
          const arg = _arg as unknown as ExpectedArgument<typeof eventName>;
          if (!this.hookCache) {
            this.hookCache = new Map<ServerEventName, ExpectedArgument<ServerEventName>>();
          }
          this.hookCache.set(eventName, arg);
          const hookSet = this.hooks.get(eventName);
          hookSet?.forEach(h => h(arg));
        } else {
          console.log(`[WebSocketManager] No hooks registered for ${eventName}, using no-op handler`);
          noop();
        }
      });
    });

    console.log('[WebSocketManager] Initiating WebSocket connection');
    this.ws.connect();
  }

  private disconnectWs() {
    if (this.ws) {
      console.log('[WebSocketManager] Disconnecting WebSocket');
      this.ws.cleanup();
      this.ws.close();
      this.ws = null;
      console.log('[WebSocketManager] WebSocket disconnected and cleaned up');
    }
  }

  registerHook<T extends ServerEventName>(key: T, hook: Hook<T>) {
    console.log(`[WebSocketManager] Registering hook for event: ${key}`);
    setTimeout(() => {
      if (!this.hooks) {
        console.log('[WebSocketManager] First hook registration, initializing hooks map and connecting WebSocket');
        this.hooks = new Map<ServerEventName, Set<Hook<ServerEventName>>>();
        setTimeout(() => this.connect(), 0);
      }

      let hookSet = this.hooks.get(key) as Set<Hook<T>> | undefined;
      if (!hookSet) {
        console.log(`[WebSocketManager] Creating new hook set for event: ${key}`);
        hookSet = new Set<Hook<T>>();
      }
      
      hookSet.add(hook);
      this.hooks.set(key, hookSet as unknown as Set<Hook<ServerEventName>>);
      console.log(`[WebSocketManager] Hook registered for ${key}, total hooks: ${hookSet.size}`);

      // Immediately update new hook with latest state if available
      const latestState = this.latestState.get(key);
      if (latestState !== undefined) {
        console.log(`[WebSocketManager] Updating new hook with latest state for ${key}`);
        hook(latestState as ExpectedArgument<T>);
      }
    }, 0);
  }

  unregisterHook<T extends ServerEventName>(key: T, hook: Hook<T>) {
    console.log(`[WebSocketManager] Unregistering hook for event: ${key}`);
    const hookSet = this.hooks?.get(key);
    if (hookSet) {
      hookSet.delete(hook as unknown as Hook<ServerEventName>);
      console.log(`[WebSocketManager] Hook removed, remaining hooks for ${key}: ${hookSet.size}`);
    }
    if (hookSet?.size === 0) {
      console.log(`[WebSocketManager] No more hooks for ${key}, cleaning up`);
      this.hooks?.delete(key);
      this.hookCache?.delete(key);
    }
    if (this.hooks?.size === 0) {
      console.log('[WebSocketManager] No more hooks registered, disconnecting WebSocket');
      this.hooks = null;
      this.disconnectWs();
    }
  }

  private setConnectionState(state: ConnectionState) {
    if (this.connectionState === state) {
      console.log(`[WebSocketManager] Already in ${state} state, skipping state change`);
      return;
    }
    console.log(`[WebSocketManager] Connection state changing: ${this.connectionState} -> ${state}`);
    this.connectionState = state;
    this.stateListeners.forEach(listener => listener(state));
  }

  private handleDisconnect() {
    if (this.connectionState === 'disconnected') {
      console.log('[WebSocketManager] Already disconnected, skipping disconnect handler');
      return;
    }

    console.log('[WebSocketManager] Handling disconnect');
    this.setConnectionState('disconnected');

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      console.log(`[WebSocketManager] Attempting reconnect (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);
      this.reconnectWithBackoff();
    } else {
      console.log('[WebSocketManager] Max reconnection attempts reached');
    }
  }

  private reconnectWithBackoff() {
    this.setConnectionState('reconnecting');
    const backoffTime = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    console.log(`[WebSocketManager] Scheduling reconnect in ${backoffTime}ms`);
    
    if (this.reconnectTimeout) {
      console.log('[WebSocketManager] Clearing existing reconnect timeout');
      clearTimeout(this.reconnectTimeout);
    }

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectAttempts++;
      console.log(`[WebSocketManager] Executing reconnect attempt ${this.reconnectAttempts}`);
      this.connectWs();
    }, backoffTime);
  }

  emit<T extends keyof ClientEvents>(
    event: T,
    data: ExpectedArgument<T>,
    options: { 
      argBehavior?: 'append' | 'replace', 
      timing?: 'immediate' | 'delayed' 
    } = {
      argBehavior: 'append',
      timing: 'delayed'
    }): boolean {
    console.log(`[WebSocketManager] Attempting to emit ${event} event`);
    if (this.connectionState !== 'connected') {
      console.log(`[WebSocketManager] Not connected, buffering ${event} event`);
      this.eventBuffer.push({ event, data, options });
      return false;
    }

    const eventQueue = this.emitQueueRef.current[event];
    console.log(`[WebSocketManager] Current queue for ${event}: ${eventQueue?.args?.size || 0} items`);
    
    const emissionAction = () => {
      console.log(`[WebSocketManager] Processing queued ${event} events`);
      const queue = this.emitQueueRef.current[event];
      if (!queue) return;
      queue.args.forEach(arg => {
        if (this.ws) {
          console.log(`[WebSocketManager] Emitting queued ${event} event`);
          if (event === 'ping') {
            this.ws.emit(event, undefined as never);
          } else {
            this.ws.emit(event, arg as never);
          }
        }
      });
      queue.args.clear();
      if (queue.timeout) {
        clearTimeout(queue.timeout);
        queue.timeout = null;
      }
      console.log(`[WebSocketManager] Queue processed for ${event}`);
    };

    let args = eventQueue?.args;
    if (options.argBehavior === 'append' && args) {
      console.log(`[WebSocketManager] Appending to existing ${event} queue`);
      args.add(data);
    } else {
      console.log(`[WebSocketManager] Creating new ${event} queue`);
      args?.clear();
      args = new Set([data]);
    }

    let timeout: ReturnType<typeof setTimeout> | null = null;
    if (options.timing === 'immediate') {
      setTimeout(emissionAction, 0);
    } else {
      // Clear existing timeout if it exists
      if (eventQueue?.timeout) {
        clearTimeout(eventQueue.timeout);
      }
      timeout = setTimeout(emissionAction, 1000);
    }

    this.emitQueueRef.current[event] = { timeout, args } as any;
    console.log(`[WebSocketManager] Event ${event} queued successfully`);
    return true;
  }

  private flushEventBuffer() {
    if (this.eventBuffer.length > 0) {
      console.log(`[WebSocketManager] Flushing ${this.eventBuffer.length} buffered events`);
    }
    while (this.eventBuffer.length > 0) {
      const event = this.eventBuffer.shift();
      if (event) {
        console.log(`[WebSocketManager] Processing buffered ${event.event} event`);
        this.emit(event.event, event.data, event.options);
      }
    }
  }

  onStateChange(listener: (state: ConnectionState) => void) {
    console.log('[WebSocketManager] Adding state change listener');
    this.stateListeners.add(listener);
    return () => {
      console.log('[WebSocketManager] Removing state change listener');
      this.stateListeners.delete(listener);
    };
  }

  getConnectionState() {
    return this.connectionState;
  }

  cleanup() {
    console.log('[WebSocketManager] Starting cleanup');
    // Unsubscribe from all projects
    this.projectSubscriptions.forEach(projectId => {
      this.unsubscribeFromProject(projectId);
    });
    this.projectSubscriptions.clear();

    if (this.reconnectTimeout) {
      console.log('[WebSocketManager] Clearing reconnect timeout');
      clearTimeout(this.reconnectTimeout);
    }
    // Clear all timeouts in the emit queue
    Object.values(this.emitQueueRef.current).forEach(queue => {
      if (queue?.timeout) {
        clearTimeout(queue.timeout);
      }
    });
    this.emitQueueRef.current = {};
    if (this.ws) {
      console.log('[WebSocketManager] Closing WebSocket connection');
      this.ws.close();
      this.ws = null;
    }
    this.setConnectionState('disconnected');
    console.log('[WebSocketManager] Clearing state listeners');
    this.stateListeners.clear();
    console.log('[WebSocketManager] Clearing event buffer');
    this.eventBuffer = [];
    console.log('[WebSocketManager] Cleanup complete');
  }

  connect() {
    if (this.connectionState === 'connected' || this.connectionState === 'connecting') {
      console.log('[WebSocketManager] Already connected or connecting, skipping connect');
      return;
    }

    console.log('[WebSocketManager] Initiating connection');
    this.connectWs();
  }

  // Add method to get latest state
  getLatestState<T extends EventName>(event: T): ExpectedArgument<T> | undefined {
    return this.latestState.get(event) as ExpectedArgument<T> | undefined;
  }

  getHookCount() {
    const count = this.hooks?.size || 0;
    console.log(`[WebSocketManager] Current hook count: ${count}`);
    return count;
  }

  subscribeToProject(projectId: string) {
    console.log(`[WebSocketManager] Subscribing to project: ${projectId}`);
    if (this.projectSubscriptions.has(projectId)) {
      console.log(`[WebSocketManager] Already subscribed to project: ${projectId}`);
      return;
    }

    this.projectSubscriptions.add(projectId);
    setTimeout(() => {
      this.emit('subscribeProject', { projectId, shouldSubscribe: true }, {
        timing: 'immediate',
        argBehavior: 'replace'
      });
    }, 0);
  }

  unsubscribeFromProject(projectId: string) {
    console.log(`[WebSocketManager] Unsubscribing from project: ${projectId}`);
    if (!this.projectSubscriptions.has(projectId)) {
      console.log(`[WebSocketManager] Not subscribed to project: ${projectId}`);
      return;
    }

    this.projectSubscriptions.delete(projectId);
    setTimeout(() => {
      this.emit('subscribeProject', { projectId, shouldSubscribe: false }, {
        timing: 'immediate',
        argBehavior: 'replace'
      });
    }, 0);
  }
}

// Update useTree to use WebSocketManager
const useTree: {
  [K in keyof ServerEvents]: (defaultValue: ExpectedArgument<K>) => [
    ExpectedArgument<K>,
    Dispatch<ExpectedArgument<K>>
  ]
} = {
  deleteProject: (defaultValue: EventPayloadMap['deleteProject']) => {
    const [value, setValue] = useState<EventPayloadMap['deleteProject']>(defaultValue);
    const wsManager = useMemo(() => WebSocketManager.getInstance(), []);
    
    useEffect(() => {
      wsManager.registerHook('deleteProject', setValue);
      return () => wsManager.unregisterHook('deleteProject', setValue);
    }, [wsManager]);
    
    return [value, setValue];
  },
  newProject: (defaultValue: EventPayloadMap['newProject']) => {
    const [value, setValue] = useState<EventPayloadMap['newProject']>(defaultValue);
    const wsManager = useMemo(() => WebSocketManager.getInstance(), []);
    
    useEffect(() => {
      wsManager.registerHook('newProject', setValue);
      return () => wsManager.unregisterHook('newProject', setValue);
    }, [wsManager]);
    
    return [value, setValue];
  },
  subscribe: (defaultValue: EventPayloadMap['subscribe']) => {
    const [value, setValue] = useState<EventPayloadMap['subscribe']>(defaultValue);
    const wsManager = useMemo(() => WebSocketManager.getInstance(), []);
    
    useEffect(() => { 
      wsManager.registerHook('subscribe', setValue);
      return () => wsManager.unregisterHook('subscribe', setValue);
    }, [wsManager]);
    
    return [value, setValue];
  },
  pong: (defaultValue: EventPayloadMap['pong']) => {
    const [value, setValue] = useState<EventPayloadMap['pong']>(defaultValue);
    return [value, setValue];
  },
  projectData: (defaultValue: EventPayloadMap['projectData']) => {
    const [value, setValue] = useState<EventPayloadMap['projectData']>(defaultValue);
    const wsManager = useMemo(() => WebSocketManager.getInstance(), []);
    
    useEffect(() => {
      wsManager.registerHook('projectData', setValue);
      return () => wsManager.unregisterHook('projectData', setValue);
    }, [wsManager]);
    
    return [value, setValue];
  }
};

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
  const [newProjectData] = useTree.newProject({} as ProjectPayload);
  const [subscribeData] = useTree.subscribe([{ geohash: '' }, [], []]);
  const [deleteProjectData] = useTree.deleteProject({ id: '' });

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
    if (!subscribeData || !Array.isArray(subscribeData)) return;
    
    const [{ geohash }, projects, groups] = subscribeData;
    logger.log('info', `[subscribe] Processing subscription data for geohash: ${geohash} (${projects.length} projects, ${groups.length} groups)`);

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

      setCurrentGeohash(geohash);
    }

    if (Array.isArray(groups)) {
      setProjectGroups(groups);
      logger.log('debug', `Updated project groups: ${groups.length} groups`);
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
            await wsManager.emit('unsubscribe', { geohash: currentGeohash });
            logger.log('info', `Unsubscribed from geohash: ${currentGeohash}`);
          }

          logger.log('info', `Subscribing to geohash: ${geohash}`);
          await wsManager.emit('subscribe', [{ geohash }, [], []]);
        }
      }, 500);
    };

    window.addEventListener('map:newBounds', handleBoundsChange as EventListener);
    return () => {
      window.removeEventListener('map:newBounds', handleBoundsChange as EventListener);
      if (currentGeohash) {
        wsManager.emit('unsubscribe', { geohash: currentGeohash });
      }
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

  const [projectData] = useTree.projectData({
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
