import { client } from "@/lib/client";
import type { ClientEvents, ServerEvents } from "@/server/routers/tree-router";
import { useEffect } from "react";
import { useMemo } from "react";
import { useState } from "react";
import { Dispatch } from "react";

// Connection state management
export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

type ClientSocket = ReturnType<typeof client.tree.live.$ws>

type EventName = keyof (ClientEvents & ServerEvents);
type ServerEventName = keyof ServerEvents;

export type EventPayloadMap = ClientEvents & ServerEvents;

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
export class WebSocketManager {
  static getInstance(): WebSocketManager {
    if (!WebSocketManager.instance) {
      console.log('[WebSocketManager] Creating new singleton instance');
      WebSocketManager.instance = new WebSocketManager();
    }
    return WebSocketManager.instance;
  }

  private static instance: WebSocketManager | null = null;
  private ws: ClientSocket | null = null;
  private socketId: string | null = null;
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

    this.ws.on('provideSocketId', (socketId: string | undefined) => {
      console.log('[WebSocketManager] Received socketId from server:', socketId);
      this.socketId = socketId ?? null;
    });
    
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
    const eventNames: (keyof ServerEvents)[] = [
      'newProject',
      'deleteProject',
      'subscribe',
      'projectData',
      'imageAnalysis',
      'imageValidation',
      'projectVision',
      'costEstimate',
      'pong',
      'ping' as keyof ServerEvents
    ];
    eventNames.forEach((eventName: keyof ServerEvents) => {
      this.ws?.on(eventName, (arg) =>
        this.handleEvent(eventName, arg as ExpectedArgument<keyof ServerEvents>)
      );
    });

    console.log('[WebSocketManager] Initiating WebSocket connection');
    this.ws.connect();
  }

  handleEvent<T extends keyof ServerEvents>(eventName: T, _arg: ExpectedArgument<T>) {
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
      this.latestState.set(eventName, arg);
      this.hookCache.set(eventName, arg);
      const hookSet = this.hooks.get(eventName);
      hookSet?.forEach(h => h(arg));
    } else {
      console.log(`[WebSocketManager] No hooks registered for ${eventName}, using no-op handler`);
      noop();
    }
  }

  private disconnectWs() {
    if (this.ws) {
      console.log('[WebSocketManager] Disconnecting WebSocket');
      this.ws.cleanup();
      this.ws.close();
      if (this.socketId) {
        client.tree.killActiveSockets.$post({ socketId: this.socketId })
      }
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
      /**
       * If the arg behavior is replace, it will only be replaced if the value of uniqueKey is the same as the existing value
       * This is useful for preventing subscribe/unsubscribe events from conflicting with unrelated subscriptions
       */
      uniqueKey?: keyof typeof data,
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
      if (!queue || !queue.args) return;
      console.log(`[WebSocketManager] Queue for ${event}:`);
      queue.args.forEach(arg => {
        console.log(arg);
      });
      queue.args.forEach(arg => {
        if (this.ws) {
          console.log(`[WebSocketManager] Emitting queued ${event} event`);
          if (event === 'ping') {
            this.ws.emit(event, undefined as never);
            this.ws.emit('pong', () => {
              console.log('pong received')
            });
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
    const existingArg = options.uniqueKey ? Array.from(args ?? []).find(arg =>
      !options.uniqueKey || !arg || !data ? false :
      (arg as any)[options.uniqueKey] === (data as any)[options.uniqueKey]
    ) : null;

    console.log(`[WebSocketManager] Considering new arg for ${event}:`, data);

    if (options.argBehavior === 'append' && args) {
      console.log(`[WebSocketManager] Appending to existing ${event} queue`);
      args.add(data);
    } else if (existingArg) {
      console.log(`[WebSocketManager] Event ${event} has unique key ${options.uniqueKey?.toString() ?? 'undefined'}`);
      args?.delete(existingArg);
      args?.add(data);
    } else {
      console.log(`[WebSocketManager] Creating new ${event} queue`);
      args?.clear();
      args = new Set([data]);
    }

    console.log(`[WebSocketManager] Queue for ${event}:`);
    args?.forEach(arg => {
      console.log(arg);
    });

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
      if (
        this.projectSubscriptions.has(projectId)
        && this.emitQueueRef.current.subscribeProject?.args.has({ projectId, shouldSubscribe: false })
      ) {
        this.emitQueueRef.current.subscribeProject?.args.clear();
      } else {
        this.emit('subscribeProject', { projectId, shouldSubscribe: true }, {
          argBehavior: 'replace',
          uniqueKey: 'projectId'
        });
      }
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
      if (
        !this.projectSubscriptions.has(projectId)
        && this.emitQueueRef.current.subscribeProject?.args.has({ projectId, shouldSubscribe: true })
      ) {
        this.emitQueueRef.current.subscribeProject?.args.clear();
      } else {
        this.emit('subscribeProject', { projectId, shouldSubscribe: false }, {
          argBehavior: 'replace',
          uniqueKey: 'projectId'
        });
      }
    }, 0);
  }
}


export const useServerEvent: {
  [K in keyof ServerEvents]: (defaultValue: ExpectedArgument<K>) => [
    ExpectedArgument<K>,
    Dispatch<ExpectedArgument<K>>
  ]
} = {
  deleteProject: (defaultValue: EventPayloadMap['deleteProject']) => {
    const [value, setValue] = useState<EventPayloadMap['deleteProject']>(defaultValue);
    const wsManager = useMemo(() => WebSocketManager.getInstance(), []);
    
    useEffect(() => {
      const latestState = wsManager.getLatestState('deleteProject');
      if (latestState) { setValue(latestState); }

      wsManager.registerHook('deleteProject', setValue);
      return () => wsManager.unregisterHook('deleteProject', setValue);
    }, [wsManager]);
    
    return [value, setValue];
  },
  newProject: (defaultValue: EventPayloadMap['newProject']) => {
    const [value, setValue] = useState<EventPayloadMap['newProject']>(defaultValue);
    const wsManager = useMemo(() => WebSocketManager.getInstance(), []);
    
    useEffect(() => {
      const latestState = wsManager.getLatestState('newProject');
      if (latestState) { setValue(latestState); }

      wsManager.registerHook('newProject', setValue);
      return () => wsManager.unregisterHook('newProject', setValue);
    }, [wsManager]);
    
    return [value, setValue];
  },
  subscribe: (defaultValue: EventPayloadMap['subscribe']) => {
    const [value, setValue] = useState<EventPayloadMap['subscribe']>(defaultValue);
    const wsManager = useMemo(() => WebSocketManager.getInstance(), []);
    
    useEffect(() => { 
      const latestState = wsManager.getLatestState('subscribe');
      if (latestState) { setValue(latestState); }

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
      const latestState = wsManager.getLatestState('projectData');
      if (latestState) { setValue(latestState); }

      wsManager.registerHook('projectData', setValue);
      return () => wsManager.unregisterHook('projectData', setValue);
    }, [wsManager]);
    
    return [value, setValue];
  },
  imageAnalysis: (defaultValue: EventPayloadMap['imageAnalysis']) => {
    const [value, setValue] = useState<EventPayloadMap['imageAnalysis']>(defaultValue);
    const wsManager = useMemo(() => WebSocketManager.getInstance(), []);
    
    useEffect(() => {
      const latestState = wsManager.getLatestState('imageAnalysis');
      if (latestState) { setValue(latestState); }

      wsManager.registerHook('imageAnalysis', setValue);
      return () => wsManager.unregisterHook('imageAnalysis', setValue);
    }, [wsManager]);
    
    return [value, setValue];
  },
  imageValidation: (defaultValue: EventPayloadMap['imageValidation']) => {
    const [value, setValue] = useState<EventPayloadMap['imageValidation']>(defaultValue);
    const wsManager = useMemo(() => WebSocketManager.getInstance(), []);
    
    useEffect(() => {
      const latestState = wsManager.getLatestState('imageValidation');
      if (latestState) { setValue(latestState); }

      wsManager.registerHook('imageValidation', setValue);
      return () => wsManager.unregisterHook('imageValidation', setValue);
    }, [wsManager]);
    
    return [value, setValue];
  },
  projectVision: (defaultValue: EventPayloadMap['projectVision']) => {
    const [value, setValue] = useState<EventPayloadMap['projectVision']>(defaultValue);
    const wsManager = useMemo(() => WebSocketManager.getInstance(), []);
    
    useEffect(() => {
      const latestState = wsManager.getLatestState('projectVision');
      if (latestState) { setValue(latestState); }

      wsManager.registerHook('projectVision', setValue);
      return () => wsManager.unregisterHook('projectVision', setValue);
    }, [wsManager]);
    
    return [value, setValue];
  },
  costEstimate: (defaultValue: EventPayloadMap['costEstimate']) => {
    const [value, setValue] = useState<EventPayloadMap['costEstimate']>(defaultValue);
    const wsManager = useMemo(() => WebSocketManager.getInstance(), []);
    
    useEffect(() => {
      const latestState = wsManager.getLatestState('costEstimate');
      if (latestState) { setValue(latestState); }

      wsManager.registerHook('costEstimate', setValue);
      return () => wsManager.unregisterHook('costEstimate', setValue);
    }, [wsManager]);
    
    return [value, setValue];
  }
};
