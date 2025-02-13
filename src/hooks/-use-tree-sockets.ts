"use client"

import { useMutation } from "@tanstack/react-query"
import { client } from "@/lib/client"
import { generateId } from "@/lib/id"
import type { TreeStatus } from "@/server/routers/tree-router"
import { useEffect, useRef, useState, useMemo, Dispatch } from "react"
import { boundsToGeohash } from "@/lib/geo/geohash"
import { useAuth } from "@clerk/nextjs"
import { WebSocketLogger } from "@/hooks/client-log"
import { NestedNonNullable } from "@/lib/nullable"

// Define base tree type
export type BaseTree = {
  id: string
  name: string
  status: TreeStatus
  _loc_lat: number
  _loc_lng: number
  _meta_created_by: string
  _meta_updated_by: string
}

// Client-side tree type with Date objects
export type Tree = BaseTree & {
  _meta_updated_at: Date
  _meta_created_at: Date
}

export type TreeGroup = {
  id: string
  count: number
  _loc_lat: number
  _loc_lng: number
  city: string
  state: string
  treeIds: string[]
}

// WebSocket payload type with string dates
export type TreePayload = BaseTree & {
  _meta_updated_at: string
  _meta_created_at: string
}

type ClientSocket = ReturnType<typeof client.tree.live.$ws>

type TreeSocketInitializer = NonNullable<typeof client.tree.live.$ws>

type TreeSocketConfig = Parameters<TreeSocketInitializer>[0]
type SocketConfig = NestedNonNullable<NonNullable<TreeSocketConfig>>

type SystemEventName = 'ping' | 'pong';
type TreeEventName = 'setTree' | 'newTree' | 'subscribe' | 'unsubscribe';
type EventName = SystemEventName | TreeEventName;

type EventPayloadMap = {
  setTree: TreePayload;
  newTree: TreePayload;
  subscribe: [{ geohash: string }, TreePayload[], TreeGroup[]];
  unsubscribe: { geohash: string };
  ping: undefined;
  pong: undefined;
};

// Update ExpectedArgument type to use the EventPayloadMap
type ExpectedArgument<T extends EventName> = T extends keyof EventPayloadMap ? EventPayloadMap[T] : never;

type Hook<T extends EventName> = (val: ExpectedArgument<T>) => void;
type HookMap<T extends EventName> = Map<T, Set<Hook<T>>>;
type HookCache<T extends EventName> = Map<T, ExpectedArgument<T>>;

const noop = () => {}

// WebSocket connection manager
class WebSocketManager {
  private static instance: WebSocketManager | null = null;
  private ws: ClientSocket | null = null;
  private hooks: HookMap<EventName> | null = null;
  private hookCache: HookCache<EventName> | null = null;
  private connectionState: ConnectionState = 'disconnected';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private eventBuffer: Array<{ event: EventName; data: ExpectedArgument<EventName> }> = [];
  private stateListeners: Set<(state: ConnectionState) => void> = new Set();
  private emitQueue: Partial<{
    [K in EventName]: {
      timeout?: ReturnType<typeof setTimeout> | null;
      args: Set<ExpectedArgument<K>>;
    }
  }> = {};

  private constructor() {
    console.log('[WebSocketManager] Instance created');
  }

  static getInstance(): WebSocketManager {
    if (!WebSocketManager.instance) {
      console.log('[WebSocketManager] Creating new singleton instance');
      WebSocketManager.instance = new WebSocketManager();
    }
    return WebSocketManager.instance;
  }

  private connectWs() {
    console.log('[WebSocketManager] Attempting to connect WebSocket');
    this.ws = client.tree.live.$ws();
    if (!this.ws.isConnected) {
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

      // Initialize all possible events with no-op handlers
      const eventNames: EventName[] = ['setTree', 'newTree', 'subscribe', 'unsubscribe'];
      eventNames.forEach(eventName => {
        this.ws?.on(eventName, (_arg) => {
          console.log(`[WebSocketManager] Received ${eventName} event from server`);
          if (eventName === 'ping' || eventName === 'pong') {
            noop();
            return;
          }

          // For non-system events, process through hook system if hooks exist
          if (this.hooks?.has(eventName)) {
            const arg = _arg as unknown as ExpectedArgument<typeof eventName>;
            if (!this.hookCache) {
              this.hookCache = new Map<EventName, ExpectedArgument<EventName>>();
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
    } else {
      console.log('[WebSocketManager] WebSocket already connected');
    }
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

  registerHook<T extends EventName>(key: T, hook: Hook<T>) {
    console.log(`[WebSocketManager] Registering hook for event: ${key}`);
    if (!this.hooks) {
      console.log('[WebSocketManager] First hook registration, initializing hooks map and connecting WebSocket');
      this.hooks = new Map<EventName, Set<Hook<EventName>>>();
      this.connectWs();
    }

    let hookSet = this.hooks.get(key) as Set<Hook<T>> | undefined;
    if (!hookSet) {
      console.log(`[WebSocketManager] Creating new hook set for event: ${key}`);
      hookSet = new Set<Hook<T>>();
    }
    
    hookSet.add(hook);
    this.hooks.set(key, hookSet as unknown as Set<Hook<EventName>>);
    console.log(`[WebSocketManager] Hook registered for ${key}, total hooks: ${hookSet.size}`);
  }

  unregisterHook<T extends EventName>(key: T, hook: Hook<T>) {
    console.log(`[WebSocketManager] Unregistering hook for event: ${key}`);
    const hookSet = this.hooks?.get(key);
    if (hookSet) {
      hookSet.delete(hook as unknown as Hook<EventName>);
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

  emit<T extends EventName>(
    event: T,
    data: ExpectedArgument<T>,
    options: {
      argBehavior?: 'append' | 'replace'
      timing?: 'immediate' | 'delayed'
    } = {
      argBehavior: 'append',
      timing: 'delayed'
    }): boolean {
    console.log(`[WebSocketManager] Attempting to emit ${event} event`);
    if (this.connectionState !== 'connected') {
      console.log(`[WebSocketManager] Not connected, buffering ${event} event`);
      this.eventBuffer.push({ event, data } as { event: EventName; data: ExpectedArgument<EventName> });
      return false;
    }

    const eventQueue = this.emitQueue[event];
    console.log(`[WebSocketManager] Current queue for ${event}: ${eventQueue?.args?.size || 0} items`);
    
    const emissionAction = () => {
      console.log(`[WebSocketManager] Processing queued ${event} events`);
      const queue = this.emitQueue[event];
      if (!queue) return;
      queue.args.forEach(arg => {
        if (this.ws) {
          console.log(`[WebSocketManager] Emitting queued ${event} event`);
          if (event === 'ping' || event === 'pong') {
            this.ws.emit(event, undefined as never);
          } else {
            this.ws.emit(event, arg as never);
          }
        }
      });
      queue.args.clear();
      console.log(`[WebSocketManager] Queue processed for ${event}`);
    }

    let timeout: ReturnType<typeof setTimeout> | null = null;
    if (options.timing === 'immediate') {
      emissionAction();
    } else {
      timeout = eventQueue?.timeout ?? setTimeout(emissionAction, 1000);
    }

    let args = eventQueue?.args;
    if (options.argBehavior === 'append' && args) {
      console.log(`[WebSocketManager] Appending to existing ${event} queue`);
      args.add(data);
    } else {
      console.log(`[WebSocketManager] Creating new ${event} queue`);
      args = new Set([data]);
    }

    this.emitQueue[event] = { timeout, args } as any;
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
        this.emit(event.event, event.data);
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
    if (this.reconnectTimeout) {
      console.log('[WebSocketManager] Clearing reconnect timeout');
      clearTimeout(this.reconnectTimeout);
    }
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
    this.setConnectionState('connecting');
    this.connectWs();
  }
}

// Update useTree to use WebSocketManager
const useTree: {
  [K in EventName]: (defaultValue: ExpectedArgument<K>) => [
    ExpectedArgument<K>,
    Dispatch<ExpectedArgument<K>>
  ]
} = {
  setTree: (defaultValue: TreePayload) => {
    const [value, setValue] = useState<TreePayload>(defaultValue);
    const wsManager = useMemo(() => WebSocketManager.getInstance(), []);
    
    useEffect(() => {
      wsManager.registerHook('setTree', setValue);
      return () => wsManager.unregisterHook('setTree', setValue);
    }, [wsManager]);
    
    return [value, setValue];
  },
  newTree: (defaultValue: TreePayload) => {
    const [value, setValue] = useState<TreePayload>(defaultValue);
    const wsManager = useMemo(() => WebSocketManager.getInstance(), []);
    
    useEffect(() => {
      wsManager.registerHook('newTree', setValue);
      return () => wsManager.unregisterHook('newTree', setValue);
    }, [wsManager]);
    
    return [value, setValue];
  },
  subscribe: (defaultValue: [{ geohash: string }, TreePayload[], TreeGroup[]]) => {
    const [value, setValue] = useState<[{ geohash: string }, TreePayload[], TreeGroup[]]>(defaultValue);
    const wsManager = useMemo(() => WebSocketManager.getInstance(), []);
    
    useEffect(() => { 
      wsManager.registerHook('subscribe', setValue);
      return () => wsManager.unregisterHook('subscribe', setValue);
    }, [wsManager]);
    
    return [value, setValue];
  },
  unsubscribe: (defaultValue: { geohash: string }) => {
    const [value, setValue] = useState<{ geohash: string }>(defaultValue);
    const wsManager = useMemo(() => WebSocketManager.getInstance(), []);
    
  useEffect(() => {
      wsManager.registerHook('unsubscribe', setValue);
      return () => wsManager.unregisterHook('unsubscribe', setValue);
    }, [wsManager]);
    
    return [value, setValue];
  },
  ping: (defaultValue: undefined) => {
    const [value, setValue] = useState<undefined>(defaultValue);
    return [value, setValue];
  },
  pong: (defaultValue: undefined) => {
    const [value, setValue] = useState<undefined>(defaultValue);
    return [value, setValue];
  }
};

// Connection state management
type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

// Update useLiveTrees hook to use the WebSocketManager
export function useLiveTrees() {
  const handlerId = useRef(`handler_${generateId()}`);
  const logger = useMemo(() => WebSocketLogger.getInstance(), []);
  const wsManager = useMemo(() => WebSocketManager.getInstance(), []);

  // Main tree storage with O(1) lookup by ID
  const [treeMap, setTreeMap] = useState<Map<string, Tree>>(new Map());
  
  // Store tree groups separately
  const [treeGroups, setTreeGroups] = useState<TreeGroup[]>([]);
  
  // Current geohash subscription
  const [currentGeohash, setCurrentGeohash] = useState<string | null>(null);
  
  // Connection state
  const [connectionState, setConnectionState] = useState<ConnectionState>(wsManager.getConnectionState());
  
  const { userId } = useAuth();

  // Use the tree hooks for state updates
  const [newTreeData] = useTree.newTree({} as TreePayload);
  const [setTreeData] = useTree.setTree({} as TreePayload);
  const [subscribeData] = useTree.subscribe([{ geohash: '' }, [], []]);

  // Register handler on mount and handle connection state
  useEffect(() => {
    logger.registerHandler(handlerId.current);
    wsManager.connect();

    const unsubscribe = wsManager.onStateChange(setConnectionState);

    return () => {
      logger.unregisterHandler(handlerId.current);
      unsubscribe();
      wsManager.cleanup();
    };
  }, [logger, wsManager]);

  // Handle new tree updates
  useEffect(() => {
    if (!newTreeData || !('id' in newTreeData)) return;
    if (newTreeData.id === "0") return;

    const processedTree: Tree = {
      ...newTreeData,
      _meta_updated_at: new Date(newTreeData._meta_updated_at),
      _meta_created_at: new Date(newTreeData._meta_created_at)
    };
    
    setTreeMap(prev => {
      const next = new Map(prev);
      next.set(processedTree.id, processedTree);
      return next;
    });
    
    logger.log('debug', `Tree ${processedTree.id} updated in client state via newTree`);
  }, [newTreeData, logger]);

  // Handle set tree updates
  useEffect(() => {
    if (!setTreeData || !('id' in setTreeData)) return;
    if (setTreeData.id === "0") return;

    const processedTree: Tree = {
      ...setTreeData,
      _meta_updated_at: new Date(setTreeData._meta_updated_at),
      _meta_created_at: new Date(setTreeData._meta_created_at)
    };
    
    setTreeMap(prev => {
      const next = new Map(prev);
      next.set(processedTree.id, processedTree);
      return next;
    });
    
    logger.log('debug', `Tree ${processedTree.id} updated in client state via setTree`);
  }, [setTreeData, logger]);

  // Handle subscription updates
  useEffect(() => {
    if (!subscribeData || !Array.isArray(subscribeData)) return;
    
    const [{ geohash }, trees, groups] = subscribeData;
    logger.log('info', `[subscribe] Processing subscription data for geohash: ${geohash} (${trees.length} trees, ${groups.length} groups)`);

    if (Array.isArray(trees)) {
      const processedTrees = trees.map(tree => ({
        ...tree,
        _meta_updated_at: new Date(tree._meta_updated_at),
        _meta_created_at: new Date(tree._meta_created_at)
      }));

      // Collect all tree IDs that are part of groups
      const groupedTreeIds = new Set<string>();
      if (Array.isArray(groups)) {
        groups.forEach(group => {
          if (group.treeIds) {
            group.treeIds.forEach(id => groupedTreeIds.add(id));
          }
        });
      }

      // Update tree map, excluding trees that are part of groups
      setTreeMap(prev => {
        const next = new Map();
        
        // First add/update all processed trees
        processedTrees.forEach(tree => {
          if (!groupedTreeIds.has(tree.id)) {
            next.set(tree.id, tree);
          }
        });

        // Then remove any existing trees that are now part of groups
        groupedTreeIds.forEach(id => {
          if (next.has(id)) {
            next.delete(id);
            logger.log('debug', `Removed tree ${id} from map as it's now part of a group`);
          }
        });

        return next;
      });

      setCurrentGeohash(geohash);
    }

    if (Array.isArray(groups)) {
      setTreeGroups(groups);
      logger.log('debug', `Updated tree groups: ${groups.length} groups`);
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
        const geohash = boundsToGeohash(bounds);
        if (currentGeohash !== geohash) {
          logger.log('debug', `Changing geohash subscription from ${currentGeohash} to ${geohash}`);
          
          if (currentGeohash) {
            await wsManager.emit('unsubscribe', { geohash: currentGeohash }, { timing: 'immediate' });
            logger.log('info', `Unsubscribed from geohash: ${currentGeohash}`);
          }

          logger.log('info', `Subscribing to geohash: ${geohash}`);
          await wsManager.emit('subscribe', [{ geohash }, [], []], { timing: 'immediate' });
          setCurrentGeohash(geohash);
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

  // Tree mutation handler
  const { mutate: setTree, isPending } = useMutation({
    mutationFn: async ({
      id,
      name,
      lat,
      lng,
      status
    }: {
      id?: string
      name: string
      lat: number
      lng: number
      status: TreeStatus
    }) => {
      const treeId = id || generateId();
      const now = new Date();
      logger.log('info', `Creating tree: ${name} at ${lat},${lng}`);
      
      const treeData: TreePayload = {
        id: treeId,
        name,
        status,
        _loc_lat: lat,
        _loc_lng: lng,
        _meta_created_by: userId || "unknown",
        _meta_updated_by: userId || "unknown",
        _meta_created_at: now.toISOString(),
        _meta_updated_at: now.toISOString()
      };
      
      await wsManager.emit('setTree', treeData);
      return { name, lat, lng, status };
    }
  });

  // Clean up logger on window unload
  useEffect(() => {
    const cleanup = () => {
      logger.cleanup();
    };
    window.addEventListener('beforeunload', cleanup);
    return () => {
      window.removeEventListener('beforeunload', cleanup);
    };
  }, []);

  return {
    treeMap,
    treeGroups,
    setTree,
    isPending,
    connectionState
  };
}
