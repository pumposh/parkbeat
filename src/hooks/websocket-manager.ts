import { asyncTimeout } from "@/lib/async";
import { client } from "@/lib/client";
import { getLogger } from "@/lib/logger";
import { ParkbeatLogger } from "@/lib/logger-types";
import { DedupeThing } from "@/lib/promise";
import type { ClientEvents, ServerEvents } from "@/server/routers/tree-router";
import { useEffect, useRef } from "react";
import { useMemo } from "react";
import { useState } from "react";
import { Dispatch } from "react";

// Connection state management
export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

// Create a console instance for WebSocketManager
// const console = getWebSocketLogger();

type ClientSocket = ReturnType<typeof client.tree.live.$ws>

// Define subscription status type
export type SubscriptionStatus = 'active' | 'unsubscribed';

type EventName = keyof (ClientEvents & ServerEvents);
type ServerEventName = keyof ServerEvents;

export type EventPayloadMap = ClientEvents & ServerEvents;

// Update ExpectedArgument type to use the EventPayloadMap
type ExpectedArgument<T extends keyof EventPayloadMap> = T extends keyof EventPayloadMap ? EventPayloadMap[T] : never;

type Hook<T extends ServerEventName> = (val: ExpectedArgument<T>) => void;
type HookMap<T extends ServerEventName> = Map<T, Set<Hook<T>>>;
type HookCache<T extends ServerEventName> = Map<T, ExpectedArgument<T>>;

// Define room subscription data type
type RoomSubscriptionData = {
  lastPingTime: number;
  heartbeatHook?: Hook<"heartbeat">;
  status: SubscriptionStatus;
  logger: ParkbeatLogger.GroupLogger | typeof console;
  removalTimeout?: NodeJS.Timeout;
  unsubscribeTime?: number; // Time when the room was marked for unsubscription
};

const noop = () => {}

/**
 * Safely convert any value to a string, handling symbols properly
 */
function safeToString(value: any): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'symbol') return String(value);
  try {
    return String(value);
  } catch (e) {
    return '[Unstringable value]';
  }
}

type EmissionOptions = {
  argBehavior?: 'append' | 'replace';
  timing?: 'immediate' | 'delayed';
}

// WebSocket connection manager
export class WebSocketManager {
  static getInstance(): WebSocketManager {
    if (!WebSocketManager.instance) {
      console.info('Creating new singleton instance');
      WebSocketManager.instance = new WebSocketManager();
    }
    return WebSocketManager.instance;
  }

  private static instance: WebSocketManager | null = null;
  private ws: ClientSocket | null = null;
  private socketId: string | null = null;
  private console: ParkbeatLogger.GroupLogger | typeof console = console;  
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
  private roomSubscriptions: Map<string, RoomSubscriptionData> = new Map();
  
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
    console.info('Instance created');
  }

  private connectWs() {    
    // Double-check connection state to prevent race conditions
    if (
      this.connectionState === 'connecting'
      || this.connectionState === 'connected'
    ) {
      this.console.info(`Already ${this.connectionState}, skipping connect`);
      return;
    }

    if (this.ws?.isConnected) {
      this.console.info('WebSocket already connected');
      this.setConnectionState('connected');
      return;
    }
    
    this.setConnectionState('connecting');
    const ws = client.tree.live.$ws();
    this.console.info('Setting up WebSocket event handlers');

    const onProvideSocketId = (socketId: string | undefined) => {
      const wsmGroupKey = `${socketId}`;
      this.console = getLogger().group(
        `${wsmGroupKey}`, `${wsmGroupKey}`, false, false
      ) || getLogger().group(
        `${wsmGroupKey}`, `${wsmGroupKey}`, false, false
      ) || console;
      this.console.info('Received socketId from server:', socketId || 'undefined');
      this.socketId = socketId ?? null;
    };

    const onError = (error: Error) => { 
      this.console.error('WebSocket error:', error);
      this.handleDisconnect();
    };

    const registerEvents = (ws: ClientSocket) => {
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
        'heartbeat'
      ];
      eventNames.forEach((eventName: keyof ServerEvents) => {
        ws.on(eventName, (arg) =>
          this.handleEvent(eventName, arg as ExpectedArgument<typeof eventName>)
        );
      });
    };

    // System events
    ws.on('onConnect', () => {
      if (this.connectionState === 'connected' || this.ws?.isConnected) {
        this.console.info('WebSocket already connected, skipping connect');
        ws.cleanup();
        return;
      }
      this.console.info('WebSocket connected successfully');

      ws.on('provideSocketId', onProvideSocketId);
      ws.on('onError', onError);
      ws.on('heartbeat', this.handleHeartbeat);
      registerEvents(ws);
      
      this.ws = ws;

      this.setConnectionState('connected');
      this.reconnectAttempts = 0;
      if (this.eventBuffer.length > 0) {
        this.console.info(`Flushing ${this.eventBuffer.length} buffered events`);
      }
      this.flushEventBuffer();
    });

    this.console.info('⭐ Initiating WebSocket connection');
    ws.connect();
  }

  handleEvent<T extends keyof ServerEvents>(eventName: T, _arg: ExpectedArgument<T>) {
    if (!this.console) {
      this.console = getLogger().group(
        'WebSocketManager', 'WebSocketManager', false, false
      ) || console;
    }

    this.console.info(`Handling event ${safeToString(eventName)} from server`, _arg);
    
    if (eventName === 'pong') {
      this.console.info(`Received pong event from server`);
      noop();
      return;
    }

    const isHeartbeat = (arg: unknown): arg is EventPayloadMap['heartbeat'] => {
      if (typeof arg !== 'object' || arg === null) return false;
      if (
        'room' in arg
        && typeof arg.room === 'string'
        && 'lastPingTime' in arg
        && typeof arg.lastPingTime === 'number'
      ) {
        return true;
      }
      return false;
    }
    if (eventName === 'heartbeat' && isHeartbeat(_arg)) {
      this.console.info(`Received heartbeat event from server:`, _arg);
      // The heartbeat handling is now done by individual project subscriptions
      // through their registered hooks
      this.setLastPingTime(_arg.room, _arg.lastPingTime);
      return;
    }

    this.console.info(`Processing ${safeToString(eventName)} event from server with data:`, _arg);

    // For non-system events, process through hook system if hooks exist
    if (this.hooks?.has(eventName)) {
      this.console.info(`Found ${this.hooks.get(eventName)?.size || 0} hooks for ${safeToString(eventName)}`);
      const arg = _arg as unknown as ExpectedArgument<typeof eventName>;
      if (!this.hookCache) {
        this.console.info(`Initializing hook cache`);
        this.hookCache = new Map<ServerEventName, ExpectedArgument<ServerEventName>>();
      }
      this.console.info(`Updating latest state for ${safeToString(eventName)}`);
      this.latestState.set(eventName, arg);
      this.hookCache.set(eventName, arg);
      const hookSet = this.hooks.get(eventName);
      this.console.info(`Notifying ${hookSet?.size || 0} hooks for ${safeToString(eventName)}`);
      hookSet?.forEach(h => {
        try {
          h(arg);
        } catch (error) {
          this.console.error(`Error in hook for ${safeToString(eventName)}:`, error);
        }
      });
    } else {
      this.console.info(`No hooks registered for ${safeToString(eventName)}, using no-op handler`);
      noop();
    }
  }

  private disconnectWs() {
    if (this.ws) {
      this.console.info('Disconnecting WebSocket');
      this.ws.cleanup();
      this.ws.close();
      if (this.socketId) {
        client.tree.killActiveSockets.$post({ socketId: this.socketId })
      }
      this.ws = null;
      this.console.info('WebSocket disconnected and cleaned up');
    }
  }

  registerHook<T extends ServerEventName>(key: T, hook: Hook<T>) {
    this.console.info(`Registering hook for event: ${safeToString(key)}`);
    setTimeout(() => {
      if (!this.hooks) {
        this.console.info('First hook registration, initializing hooks map and connecting WebSocket');
        this.hooks = new Map<ServerEventName, Set<Hook<ServerEventName>>>();
        
        // Only connect if we're not already connected or connecting
        if (this.connectionState !== 'connected' && this.connectionState !== 'connecting') {
          this.console.info('Connecting WebSocket as we are in disconnected state');
          setTimeout(() => this.connect(), 0);
        } else {
          this.console.info(`Not connecting WebSocket as we are already in ${this.connectionState} state`);
        }
      }

      let hookSet = this.hooks.get(key) as Set<Hook<T>> | undefined;
      if (!hookSet) {
        this.console.info(`Creating new hook set for event: ${safeToString(key)}`);
        hookSet = new Set<Hook<T>>();
      }
      
      // Check if this hook is already registered to avoid duplicates
      if (!hookSet.has(hook as unknown as Hook<ServerEventName>)) {
        hookSet.add(hook);
        this.hooks.set(key, hookSet as unknown as Set<Hook<ServerEventName>>);
        this.console.info(`Hook registered for ${safeToString(key)}, total hooks: ${hookSet.size}`);
      } else {
        this.console.info(`Hook already registered for ${safeToString(key)}, skipping registration`);
      }

      // Immediately update new hook with latest state if available
      const latestState = this.latestState.get(key);
      if (latestState !== undefined) {
        this.console.info(`Updating new hook with latest state for ${safeToString(key)}`);
        hook(latestState as ExpectedArgument<T>);
      }
      
      this.stateListeners.forEach(listener => listener(this.connectionState));
    }, 0);
  }

  unregisterHook<T extends ServerEventName>(key: T, hook: Hook<T>) {
    const hookSet = this.hooks?.get(key);
    if (!hookSet) return;

    this.console.info('hookSet', hookSet);

    this.console.info(`Unregistering hook for event: ${safeToString(key)}`);

    hookSet.delete(hook as unknown as Hook<ServerEventName>);
    this.console.info(`Hook removed, remaining hooks for ${safeToString(key)}: ${hookSet.size}`);

    if (hookSet?.size === 0) {
      this.console.info(`No more hooks for ${safeToString(key)}, cleaning up`);
      this.hooks?.delete(key);
      this.hookCache?.delete(key);
    }
    if (this.hooks?.size === 0) {
      this.console.info('No more hooks registered, disconnecting WebSocket');
      this.hooks = null;
      this.disconnectWs();
    }
  }

  private setConnectionState(state: ConnectionState) {
    if (this.connectionState === state) {
      this.console.info(`Already in ${state} state, skipping state change`);
      return;
    }
    this.console.info(`Connection state changing: ${this.connectionState} -> ${state}`);
    this.connectionState = state;
    this.stateListeners.forEach(listener => listener(state));
  }

  private handleDisconnect() {
    if (this.connectionState === 'disconnected') {
      this.console.info('Already disconnected, skipping disconnect handler');
      return;
    }

    this.console.info('Handling disconnect');
    this.setConnectionState('disconnected');

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.console.info(`Attempting reconnect (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);
      this.reconnectWithBackoff();
    } else {
      this.console.info('Max reconnection attempts reached');
    }
  }

  private reconnectWithBackoff() {
    this.setConnectionState('reconnecting');
    const backoffTime = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.console.info(`Scheduling reconnect in ${backoffTime}ms`);
    
    if (this.reconnectTimeout) {
      this.console.info('Clearing existing reconnect timeout');
      clearTimeout(this.reconnectTimeout);
    }

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectAttempts++;
      this.console.info(`Executing reconnect attempt ${this.reconnectAttempts}`);
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
    this.console.info(`Attempting to emit ${safeToString(event)} event with data:`, data);
    this.console.info(`Emit options:`, options);
    
    if (this.connectionState !== 'connected') {
      this.console.info(`Not connected (state: ${this.connectionState}), buffering ${safeToString(event)} event`);
      this.eventBuffer.push({ event, data, options });
      return false;
    }

    const eventQueue = this.emitQueueRef.current[event];
    this.console.info(`Current queue for ${safeToString(event)}: ${eventQueue?.args?.size || 0} items`);
    
    const emissionAction = () => {
      this.console.info(`Processing queued ${safeToString(event)} events`);
      const queue = this.emitQueueRef.current[event];
      if (!queue || !queue.args) {
        this.console.info(`No queue found for ${safeToString(event)}, skipping emission`);
        return;
      }
      this.console.info(`Queue for ${safeToString(event)} contains ${queue.args.size} items:`);
      queue.args.forEach(arg => {
        this.console.info(`Queue item for ${safeToString(event)}:`, arg);
      });
      queue.args.forEach(arg => {
        if (this.ws) {
          this.console.info(`Emitting queued ${safeToString(event)} event with data:`, arg);
          if (event === 'ping') {
            /** noop */
          } else {
            this.console.info(`Emitting ${safeToString(event)} event to WebSocket`);
            this.ws.emit(event, arg as never);
          }
        } else {
          this.console.error(`ERROR: WebSocket is null, cannot emit ${safeToString(event)}`);
        }
      });
      queue.args.clear();
      if (queue.timeout) {
        this.console.info(`Clearing timeout for ${safeToString(event)} queue`);
        clearTimeout(queue.timeout);
        queue.timeout = null;
      }
      this.console.info(`Queue processed for ${safeToString(event)}`);
    };

    let args = eventQueue?.args;
    
    // Check for existing arg with the same uniqueKey if provided
    let existingArg = null;
    if (options.uniqueKey && args) {
      this.console.info(`Checking for existing arg with uniqueKey ${safeToString(options.uniqueKey)}`);
      
      // Log all current args in the queue for debugging
      this.console.info(`Current args in queue for ${safeToString(event)}:`);
      args.forEach(arg => {
        this.console.info(`- Arg:`, arg);
        if (options.uniqueKey && arg) {
          this.console.info(`  uniqueKey value: ${safeToString((arg as any)[options.uniqueKey])}`);
        }
      });
      
      // Log the uniqueKey value we're looking for
      if (data && options.uniqueKey) {
        this.console.info(`Looking for uniqueKey value: ${safeToString((data as any)[options.uniqueKey])}`);
      }
      
      existingArg = Array.from(args).find(arg => {
        if (!options.uniqueKey || !arg || !data) {
          return false;
        }
        
        const keyMatches = (arg as any)[options.uniqueKey] === (data as any)[options.uniqueKey];
        
        // Enhanced logging for uniqueKey comparison
        const argKeyValue = (arg as any)[options.uniqueKey];
        const dataKeyValue = (data as any)[options.uniqueKey];
        this.console.info(`Comparing uniqueKey ${safeToString(options.uniqueKey)}: ${safeToString(argKeyValue)} vs ${safeToString(dataKeyValue)}`);
        
        if (keyMatches) {
          this.console.info(`Found existing arg with matching uniqueKey:`, arg);
        }
        return keyMatches;
      });
    }

    this.console.info(`Processing new arg for ${safeToString(event)}:`, data);

    // For subscribe/unsubscribe events, check if we're trying to cancel out operations
    if ((event === 'subscribe' || event === 'subscribeProject') && options.uniqueKey) {
      const isSubscribeRequest = (data as any).shouldSubscribe === true;
      
      if (existingArg) {
        const existingIsSubscribe = (existingArg as any).shouldSubscribe === true;
        
        this.console.info(`Found existing ${existingIsSubscribe ? 'subscribe' : 'unsubscribe'} request for the same ${safeToString(options.uniqueKey)}`);
        this.console.info(`Current request is ${isSubscribeRequest ? 'subscribe' : 'unsubscribe'}`);
        
        // If we have a subscribe followed by unsubscribe or vice versa, they cancel each other out
        if (existingIsSubscribe !== isSubscribeRequest) {
          this.console.info(`Subscribe/unsubscribe requests cancel each other out, removing from queue`);
          args?.delete(existingArg);
          
          // If this is a subscribe canceling an unsubscribe, we need to update the room status
          if (isSubscribeRequest && event === 'subscribe' && options.uniqueKey === 'geohash') {
            const geohash = (data as any).geohash;
            const roomKey = `geohash:${geohash}`;
            this.console.info(`Reactivating room ${roomKey} due to canceled unsubscribe`);
            const roomData = this.roomSubscriptions.get(roomKey);
            if (roomData && roomData.status === 'unsubscribed') {
              if (roomData.removalTimeout) {
                clearTimeout(roomData.removalTimeout);
              }
              this.roomSubscriptions.set(roomKey, {
                ...roomData,
                status: 'active',
                removalTimeout: undefined,
                lastPingTime: Date.now()
              });
              this.stateListeners.forEach(listener => listener(this.connectionState));
            }
          } else if (isSubscribeRequest && event === 'subscribeProject' && options.uniqueKey === 'projectId') {
            const projectId = (data as any).projectId;
            const roomKey = `project:${projectId}`;
            this.console.info(`Reactivating room ${roomKey} due to canceled unsubscribe`);
            const roomData = this.roomSubscriptions.get(roomKey);
            if (roomData && roomData.status === 'unsubscribed') {
              if (roomData.removalTimeout) {
                clearTimeout(roomData.removalTimeout);
              }
              this.roomSubscriptions.set(roomKey, {
                ...roomData,
                status: 'active',
                removalTimeout: undefined,
                lastPingTime: Date.now()
              });
              this.stateListeners.forEach(listener => listener(this.connectionState));
            }
          }
          
          return true;
        }
      }
    }

    if (options.argBehavior === 'append' && args) {
      this.console.info(`Appending to existing ${safeToString(event)} queue`);
      args.add(data);
    } else if (existingArg) {
      this.console.info(`Replacing existing arg with uniqueKey ${safeToString(options.uniqueKey)}`);
      args?.delete(existingArg);
      args?.add(data);
    } else {
      this.console.info(`Creating new ${safeToString(event)} queue`);
      args = args || new Set();
      args.add(data);
    }

    this.console.info(`Updated queue for ${safeToString(event)} now contains ${args?.size || 0} items:`);
    args?.forEach(arg => {
      this.console.info(`Queue item:`, arg);
    });

    let timeout: ReturnType<typeof setTimeout> | null = null;
    
    // For subscription events, use immediate timing to ensure they're processed quickly
    const useImmediateTiming = options.timing === 'immediate' || 
                              (event === 'subscribe' || event === 'subscribeProject');
    
    if (useImmediateTiming) {
      this.console.info(`Using immediate timing for ${safeToString(event)}, executing now`);
      setTimeout(emissionAction, 0);
    } else {
      // Clear existing timeout if it exists
      if (eventQueue?.timeout) {
        this.console.info(`Clearing existing timeout for ${safeToString(event)}`);
        clearTimeout(eventQueue.timeout);
      }
      this.console.info(`Using delayed timing for ${safeToString(event)}, scheduling for 1000ms`);
      timeout = setTimeout(emissionAction, 1000);
    }

    this.emitQueueRef.current[event] = { timeout, args } as any;
    this.console.info(`Event ${safeToString(event)} queued successfully`);
    return true;
  }

  private flushEventBuffer() {
    if (this.eventBuffer.length === 0) {
      this.console.info(`Event buffer is empty, nothing to flush`);
      return;
    }
    
    this.console.info(`Flushing ${this.eventBuffer.length} buffered events`);
    this.console.info(`Current connection state: ${this.connectionState}`);
    
    // Log buffered events
    this.console.info(`Buffered events:`, this.eventBuffer.map(e => `${safeToString(e.event)} (${JSON.stringify(e.data)})`));
    
    // Process events in order, but prioritize subscription events by using immediate timing
    while (this.eventBuffer.length > 0) {
      const event = this.eventBuffer.shift();
      if (!event) continue;
      
      // Use immediate timing for subscription events
      const isSubscriptionEvent = event.event === 'subscribe' || event.event === 'subscribeProject';
      const options = isSubscriptionEvent 
        ? { ...event.options, timing: 'immediate' as const }
        : event.options;
      
      this.console.info(`Processing buffered ${safeToString(event.event)} event with data:`, event.data);
      this.console.info(`Using options:`, options);
      
      const result = this.emit(event.event, event.data, options);
      this.console.info(`Emit result for buffered ${safeToString(event.event)} event: ${result ? 'success' : 'failure'}`);
    }
    
    this.console.info(`Event buffer processing complete`);
  }

  onStateChange(listener: (state: ConnectionState) => void) {
    this.console.info('Adding state change listener');
    this.stateListeners.add(listener);
    return () => {
      this.console.info('Removing state change listener');
      this.stateListeners.delete(listener);
    };
  }

  getConnectionState() {
    return this.connectionState;
  }

  cleanup() {
    this.console.info('Starting cleanup');
    // Unsubscribe from all projects
    this.roomSubscriptions.forEach((data, room) => {
      // Unregister heartbeat hook if it exists
      if (data.heartbeatHook) {
        this.console.info(`Unregistering heartbeat hook for room: ${room}`);
        this.unregisterHook('heartbeat', data.heartbeatHook);
      }
      this.unsubscribeFromRoom(room);
    });
    this.roomSubscriptions.clear();

    if (this.reconnectTimeout) {
      this.console.info('Clearing reconnect timeout');
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
      this.console.info('Closing WebSocket connection');
      this.ws.close();
      this.ws = null;
    }
    this.setConnectionState('disconnected');
    this.console.info('Clearing state listeners');
    this.stateListeners.clear();
    this.console.info('Clearing event buffer');
    this.eventBuffer = [];
    this.console.info('Cleanup complete');
  }

  connect() {
    if (this.connectionState === 'connected' || this.connectionState === 'connecting') {
      this.console.info(`Already in ${this.connectionState} state, skipping connect request`);
      return;
    }

    this.console.info('Initiating connection');
    this.connectWs();
  }

  // Add method to get latest state
  getLatestState<T extends EventName>(event: T): ExpectedArgument<T> | undefined {
    return this.latestState.get(event) as ExpectedArgument<T> | undefined;
  }

  getHookCount() {
    const count = this.hooks?.size || 0;
    this.console.info(`Current hook count: ${count}`);
    return count;
  }

  getActiveSubscriptions(): Set<string> {
    const activeSubscriptions = new Set<string>();
    this.roomSubscriptions.forEach((data, key) => {
      if (data.status === 'active') {
        activeSubscriptions.add(key);
      }
    });
    this.console.info(`Getting active subscriptions: ${activeSubscriptions.size}`);
    return activeSubscriptions;
  }

  getLastPingTime(roomKey: string): number | null {
    const roomData = this.roomSubscriptions.get(roomKey);
    return roomData ? roomData.lastPingTime : null;
  }

  getSubscriptionStatus(roomKey: string): SubscriptionStatus | null {
    const roomData = this.roomSubscriptions.get(roomKey);
    return roomData ? roomData.status : null;
  }

  // Get the time when the room was marked for removal (when it was unsubscribed)
  getUnsubscribeTime(roomKey: string): number | null {
    const roomData = this.roomSubscriptions.get(roomKey);
    if (!roomData || roomData.status !== 'unsubscribed') return null;
    
    // Return the stored unsubscribe time if available
    if (roomData.unsubscribeTime) {
      return roomData.unsubscribeTime;
    }
    
    // Fall back to estimation if unsubscribeTime is not available (for backward compatibility)
    return Date.now() - (15000 - this.getRemainingRemovalTime(roomKey));
  }
  
  // Get the remaining time (in ms) until an unsubscribed room is removed
  getRemainingRemovalTime(roomKey: string): number {
    const roomData = this.roomSubscriptions.get(roomKey);
    if (!roomData || roomData.status !== 'unsubscribed' || !roomData.removalTimeout) return 0;
    
    // If we have the unsubscribe time, calculate the remaining time directly
    if (roomData.unsubscribeTime) {
      const elapsedSinceUnsubscribe = Date.now() - roomData.unsubscribeTime;
      return Math.max(0, 15000 - elapsedSinceUnsubscribe);
    }
    
    // Fall back to timeout ID estimation if unsubscribeTime is not available
    // Get the timeout ID as a number
    const timeoutId = roomData.removalTimeout[Symbol.toPrimitive]();
    
    // Get the current highest timeout ID (most recently created timeout)
    const currentTimeoutId = setTimeout(() => {}, 0)[Symbol.toPrimitive]();
    clearTimeout(currentTimeoutId);
    
    // Estimate remaining time based on the difference between timeout IDs
    // This is a heuristic and not 100% accurate, but gives a reasonable approximation
    // The closer the timeout ID is to the current ID, the more recently it was created
    const idDifference = currentTimeoutId - timeoutId;
    const estimatedElapsedTime = Math.min(idDifference * 10, 15000); // Scale factor of 10ms per ID difference
    const remainingTime = Math.max(0, 15000 - estimatedElapsedTime);
    
    return remainingTime;
  }

  // Register a heartbeat hook for this project
  private handleHeartbeat(arg: EventPayloadMap['heartbeat']) {
    const self = WebSocketManager.getInstance();

    const { room, lastPingTime } = arg;
    const logger = self.roomSubscriptions?.get(room)?.logger
      || getLogger().group(room, room, false, false)
      || self.console;
    logger.info('Received heartbeat event from server:', arg);
    if (!room || !lastPingTime) {
      logger.info(`Invalid heartbeat format:`, arg);
      return;
    }

    self.setLastPingTime(room, lastPingTime);
  };

  setLastPingTime(room: string, lastPingTime: number) {
    const logger = this.roomSubscriptions?.get(room)?.logger
      || getLogger().group(room, room, false, false)
      || this.console;
    logger.info(`Setting last ping time for ${room} to ${lastPingTime} (${new Date(lastPingTime).toLocaleTimeString()})`);
    const existingData = this.roomSubscriptions?.get(room);
    if (!existingData) {
      logger.info(`Room ${room} not found, cannot set last ping time`);
      return;
    }
    
    logger.info(`Existing room data for ${room}:`, existingData);
    const newData = { ...existingData, lastPingTime };  
    this.roomSubscriptions.set(room, newData);
    logger.info(`Updated room data for ${room}:`, newData);
    
    if (existingData?.heartbeatHook) {
      logger.info(`Calling heartbeat hook for ${room}`);
      existingData.heartbeatHook({ room, lastPingTime });
    } else {
      logger.info(`No heartbeat hook found for ${room}`);
    }
  }

  subscribeToRoom(itemId: string, prefix = 'geohash') {
    const roomKey = `${prefix}:${itemId}`;
    const logger = this.roomSubscriptions.get(roomKey)?.logger
      || getLogger().group(roomKey, roomKey, false, false)
      || this.console;

    logger.info(`Subscribing to room: ${roomKey}`);
    logger.info(`Current connection state: ${this.connectionState}`);
    logger.info(`Current subscriptions:`, Array.from(this.roomSubscriptions.keys()));
    
    // Check if room exists but is marked as unsubscribed
    const existingRoom = this.roomSubscriptions.get(roomKey);
    logger.info(`Existing room data for ${roomKey}:`, existingRoom);
    
    if (existingRoom) {
      if (existingRoom.status === 'unsubscribed') {
        logger.info(`Reactivating unsubscribed room: ${roomKey}`);
        logger.info(`Removal timeout exists:`, !!existingRoom.removalTimeout);
        
        // Clear any pending removal timeout
        if (existingRoom.removalTimeout) {
          logger.info(`Clearing removal timeout for ${roomKey}`);
          clearTimeout(existingRoom.removalTimeout);
        }
        // Update status to active
        this.roomSubscriptions.set(roomKey, {
          ...existingRoom,
          status: 'active',
          logger,
          removalTimeout: undefined,
          lastPingTime: Date.now() // Reset ping time
        });
        
        logger.info(`Updated room data for ${roomKey}:`, this.roomSubscriptions.get(roomKey));
        
        // Notify state listeners about the subscription change
        logger.info(`Notifying ${this.stateListeners.size} state listeners about reactivation`);
        this.stateListeners.forEach(listener => listener(this.connectionState));
        
        // Use asyncTimeout to ensure proper timing
        setTimeout(async () => {
          await asyncTimeout(0);
          
          // Send subscription request based on prefix type
          this.console.info(`Sending subscription request for reactivated room ${roomKey}`);
          switch (prefix) {
            case 'project':
              this.console.info(`Emitting subscribeProject event for ${itemId}`);
              this.emit(
                'subscribeProject', 
                { projectId: itemId, shouldSubscribe: true }, 
                { argBehavior: 'replace', uniqueKey: 'projectId', timing: 'immediate' }
              );
              break;
            case 'geohash':
              this.console.info(`Emitting subscribe event for ${itemId}`);
              this.emit(
                'subscribe', 
                { geohash: itemId, shouldSubscribe: true }, 
                { argBehavior: 'replace', uniqueKey: 'geohash', timing: 'immediate' }
              );
              break;
          }
        }, 0);
        
        return;
      } else {
        this.console.info(`Already subscribed to room: ${roomKey}, status: ${existingRoom.status}`);
        return;
      }
    }

    this.console.info(`Creating new subscription for ${roomKey}`);
    
    // Set initial ping time and status
    this.roomSubscriptions.set(roomKey, { 
      lastPingTime: Date.now(),
      status: 'active',
      logger,
      removalTimeout: undefined,
      unsubscribeTime: undefined
    });
    
    logger.info(`Initial room data for ${roomKey}:`, this.roomSubscriptions.get(roomKey));
    
    // Notify state listeners about the subscription change
    logger.info(`Notifying ${this.stateListeners.size} state listeners about new subscription`);
    this.stateListeners.forEach(listener => listener(this.connectionState));
    
    const event = prefix === 'project' ? 'subscribeProject' : 'subscribe';
    
    setTimeout(() => {
      logger.info(`In setTimeout for ${roomKey}, checking if room still exists`);
      // Check if we need to clear existing queue
      if (this.roomSubscriptions.has(roomKey)) {
        logger.info(`Room ${roomKey} still exists in setTimeout`);
        // Clear any pending events in the queue
        if (this.emitQueueRef.current[event]?.timeout) {
          logger.info(`Clearing existing queue for ${event}`);
          clearTimeout(this.emitQueueRef.current[event]!.timeout!);
          this.emitQueueRef.current[event]!.args.clear();
        }
        
        // Use asyncTimeout to ensure proper timing
        (async () => {
          const shallPass = await DedupeThing.getInstance().dedupe(roomKey);
          if (!shallPass) {
            logger.info(`DedupeThing returned false for ${roomKey}, skipping subscription request`);
            return;
          }
          
          // Send subscription request based on prefix type
          logger.info(`Sending subscription request for ${roomKey} from setTimeout`);
          switch (prefix) {
            case 'project':
              logger.info(`Emitting subscribeProject event for ${itemId} from setTimeout`);
              this.emit(
                'subscribeProject', 
                { projectId: itemId, shouldSubscribe: true }, 
                { argBehavior: 'replace', uniqueKey: 'projectId', timing: 'immediate' }
              );
              break;
            case 'geohash':
              logger.info(`Emitting subscribe event for ${itemId} from setTimeout`);
              this.emit(
                'subscribe', 
                { geohash: itemId, shouldSubscribe: true }, 
                { argBehavior: 'replace', uniqueKey: 'geohash', timing: 'immediate' }
              );
              break;
          }
        })();
      } else {
        logger.info(`Room ${roomKey} no longer exists in setTimeout, skipping subscription request`);
      }
    }, 0);
  }

  async unsubscribeFromRoom(itemId: string, prefix = 'geohash') {
    const roomKey = `${prefix}:${itemId}`;
    this.console.info(`Unsubscribing from room: ${roomKey}`);
    this.console.info(`Current connection state: ${this.connectionState}`);
    this.console.info(`Current subscriptions:`, Array.from(this.roomSubscriptions.keys()));
    
    // Get the existing subscription data
    const existingData = this.roomSubscriptions.get(roomKey);
    this.console.info(`Existing room data for ${roomKey}:`, existingData);
    
    if (!existingData) {
      this.console.info(`Room not found: ${roomKey}, cannot unsubscribe`);
      return;
    }
    
    // If already unsubscribed, do nothing
    if (existingData.status === 'unsubscribed') {
      this.console.info(`Room already unsubscribed: ${roomKey}, status: ${existingData.status}`);
      return;
    }
    
    // Mark the room as unsubscribed immediately to prevent race conditions
    const unsubscribeTime = Date.now();
    this.console.info(`Setting unsubscribe time for ${roomKey} to ${unsubscribeTime}`);
    
    // Create the removal timeout
    this.console.info(`Creating removal timeout for ${roomKey} (15 seconds)`);
    const removalTimeout = setTimeout(() => {
      this.console.info(`Removal timeout triggered for ${roomKey}`);
      this.console.info(`Removing unsubscribed room after delay: ${roomKey}`);
      this.roomSubscriptions.delete(roomKey);
      this.console.info(`Room ${roomKey} removed, remaining rooms:`, Array.from(this.roomSubscriptions.keys()));
      // Notify state listeners about the subscription change
      this.console.info(`Notifying ${this.stateListeners.size} state listeners about room removal`);
      this.stateListeners.forEach(listener => listener(this.connectionState));
    }, 15000);
    
    // Update the room data before sending the unsubscription request
    this.roomSubscriptions.set(roomKey, {
      ...existingData,
      status: 'unsubscribed',
      unsubscribeTime,
      removalTimeout
    });
    
    this.console.info(`Updated room data for ${roomKey}:`, this.roomSubscriptions.get(roomKey));
    
    // Notify state listeners about the subscription change
    this.console.info(`Notifying ${this.stateListeners.size} state listeners about unsubscription`);
    this.stateListeners.forEach(listener => listener(this.connectionState));
    
    // Use asyncTimeout to ensure proper timing
    await asyncTimeout(0);
    
    // Send unsubscription request based on prefix type
    this.console.info(`Sending unsubscription request for ${roomKey}`);
    switch (prefix) {
      case 'project':
        this.console.info(`Emitting subscribeProject event with shouldSubscribe=false for ${itemId}`);
        this.emit(
          'subscribeProject', 
          { projectId: itemId, shouldSubscribe: false }, 
          { argBehavior: 'replace', uniqueKey: 'projectId', timing: 'immediate' }
        );
        break;
      case 'geohash':
        this.console.info(`Emitting subscribe event with shouldSubscribe=false for ${itemId}`);
        this.emit(
          'subscribe', 
          { geohash: itemId, shouldSubscribe: false }, 
          { argBehavior: 'replace', uniqueKey: 'geohash', timing: 'immediate' }
        );
        break;
    }
    
    // Unregister any heartbeat hooks
    if (existingData.heartbeatHook) {
      this.console.info(`Unregistering heartbeat hook for ${roomKey}`);
      this.unregisterHook('heartbeat', existingData.heartbeatHook);
    } else {
      this.console.info(`No heartbeat hook found for ${roomKey}`);
    }
  }

  // Add method to get all subscriptions including unsubscribed ones
  getAllSubscriptions(): Map<string, SubscriptionStatus> {
    const allSubscriptions = new Map<string, SubscriptionStatus>();
    this.roomSubscriptions.forEach((data, key) => {
      allSubscriptions.set(key, data.status);
    });
    return allSubscriptions;
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
  },
  heartbeat: (defaultValue: EventPayloadMap['heartbeat']) => {
    const [value, setValue] = useState<EventPayloadMap['heartbeat']>(defaultValue);
    const wsManager = useMemo(() => WebSocketManager.getInstance(), []);

    useEffect(() => {
      const latestState = wsManager.getLatestState('heartbeat');
      if (latestState) { setValue(latestState); }

      wsManager.registerHook('heartbeat', setValue);
      return () => wsManager.unregisterHook('heartbeat', setValue);
    }, [wsManager]);

    return [value, setValue];
  }
};

// Type definition for WebSocket state information
export type WebSocketState = {
  connectionState: ConnectionState;
  activeSubscriptions: string[];
  unsubscribedRooms: string[];
  hookCount: number;
  isConnected: boolean;
};

// Hook to provide WebSocket connection state and subscriptions
export function useWebSocketState(): WebSocketState {
  const wsManager = useMemo(() => WebSocketManager.getInstance(), []);

  const initialState = useMemo<WebSocketState>(() => ({
    connectionState: wsManager.getConnectionState() || 'disconnected',
    activeSubscriptions: Array.from(wsManager.getActiveSubscriptions()),
    unsubscribedRooms: Array.from(wsManager.getAllSubscriptions())
      .filter(([_, status]) => status === 'unsubscribed')
      .map(([key]) => key),
    hookCount: wsManager.getHookCount(),
    isConnected: wsManager.getConnectionState() === 'connected'
  }), [wsManager]); 
  
  const [state, setState] = useState<WebSocketState>(initialState);
  
  
  useEffect(() => {
    // Initial state update
    updateState();
    
    // Subscribe to connection state changes
    const unsubscribe = wsManager.onStateChange(() => {
      updateState();
    });
    
    // Update state function
    function updateState() {
      const connectionState = wsManager.getConnectionState();
      const allSubscriptions = wsManager.getAllSubscriptions();
      const unsubscribedRooms = Array.from(allSubscriptions)
        .filter(([_, status]) => status === 'unsubscribed')
        .map(([key]) => key);

      const newState = {
        connectionState,
        activeSubscriptions: Array.from(wsManager.getActiveSubscriptions()),
        unsubscribedRooms,
        hookCount: wsManager.getHookCount(),
        isConnected: connectionState === 'connected'
      };

      setState(newState);
    }
    
    // Clean up subscription
    return () => {
      unsubscribe();
    };
  }, [wsManager]);
  
  return state;
}
