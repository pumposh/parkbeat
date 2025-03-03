import { generateId } from './id';
import { asyncClearedObstruction, onClearedObstruction } from './obstruction';

export type StateChangeListener<T> = (value: T) => void;

/**
 * A reusable class-based state manager that allows components to monitor and update shared state values.
 * Inspired by the WebSocketManager's singleton pattern and hook registration system.
 */
export class StateManager<T> {
  private static instances = new Map<string, StateManager<any>>();
  private state: T;
  private listeners: Map<string, StateChangeListener<T>> = new Map();
  private persistenceKey: string;
  private persistenceEnabled: boolean = false;
  private readonly id: string;

  /**
   * Get an existing instance of StateManager or create a new one if it doesn't exist
   * @param id - Unique identifier for this state manager
   * @param initialState - Initial state value
   * @param options - Configuration options
   * @returns StateManager instance
   */
  static getInstance<S>(
    id: string, 
    initialState: S, 
    options: { 
      persistence?: boolean,
      persistenceKey?: string 
    } = {}
  ): StateManager<S> {
    if (!StateManager.instances.has(id)) {
      StateManager.instances.set(id, new StateManager<S>(id, initialState, options));
    }
    return StateManager.instances.get(id) as StateManager<S>;
  }

  /**
   * Create a new StateManager instance
   * @param id - Unique identifier for this state manager
   * @param initialState - Initial state value
   * @param options - Configuration options
   */
  private constructor(
    id: string, 
    initialState: T, 
    options: { 
      persistence?: boolean,
      persistenceKey?: string 
    } = {}
  ) {
    this.id = id;
    this.state = initialState;
    this.persistenceEnabled = !!options.persistence;
    this.persistenceKey = options.persistenceKey || `state-manager-${id}`;

    // Initialize persistence if enabled
    if (this.persistenceEnabled) {
      this.initializePersistence();
    }
  }

  /**
   * Initialize persistence by loading state from IndexedDB
   */
  private async initializePersistence() {
    if (typeof window === 'undefined') return;

    try {
      const storedState = await this.getFromIndexedDB();
      if (storedState !== undefined) {
        this.state = storedState;
        this.notifyListeners();
      } else {
        // Save initial state to IndexedDB
        this.saveToIndexedDB(this.state);
      }
    } catch (error) {
      console.error('Failed to initialize persistence for StateManager:', error);
    }
  }

  /**
   * Save state to IndexedDB
   * @param value - State value to save
   */
  private async saveToIndexedDB(value: T): Promise<void> {
    if (!this.persistenceEnabled || typeof window === 'undefined') return;

    try {
      return new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('StateManagerStore', 1);
        
        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains('states')) {
            db.createObjectStore('states', { keyPath: 'id' });
          }
        };

        request.onsuccess = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          const transaction = db.transaction('states', 'readwrite');
          const store = transaction.objectStore('states');
          
          const storeData = {
            id: this.persistenceKey,
            value: this.transformForStorage(value),
            timestamp: Date.now()
          };
          
          const putRequest = store.put(storeData);
          
          transaction.oncomplete = () => {
            db.close();
            resolve();
          };
          
          transaction.onerror = (error) => {
            console.error('Transaction error:', error);
            db.close();
            reject(error);
          };
          
          putRequest.onerror = (error) => {
            console.error('Put request error:', error);
            reject(error);
          };
        };
        
        request.onerror = (error) => {
          console.error('Database error:', error);
          reject(error);
        };
      });
      
      // Use asyncClearedObstruction to prevent UI blocking
      // await asyncClearedObstruction({ maxTime: 1000 });
    } catch (error) {
      console.error('Failed to save state to IndexedDB:', error);
    }
  }

  /**
   * Get state from IndexedDB
   * @returns State value or undefined if not found
   */
  private async getFromIndexedDB(): Promise<T | undefined> {
    if (!this.persistenceEnabled || typeof window === 'undefined') return undefined;

    try {
      return new Promise<T | undefined>((resolve, reject) => {
        let result: T | undefined = undefined;
        
        const request = indexedDB.open('StateManagerStore', 1);
        
        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains('states')) {
            db.createObjectStore('states', { keyPath: 'id' });
          }
        };

        request.onsuccess = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          const transaction = db.transaction('states', 'readonly');
          const store = transaction.objectStore('states');
          
          const getRequest = store.get(this.persistenceKey);
          
          getRequest.onsuccess = () => {
            if (getRequest.result) {
              result = this.transformFromStorage(getRequest.result.value);
            }
            db.close();
            resolve(result);
          };
          
          getRequest.onerror = (error) => {
            console.error('Get request error:', error);
            db.close();
            reject(error);
          };
        };
        
        request.onerror = (error) => {
          console.error('Database error:', error);
          reject(error);
        };
      });
      
      // Use asyncClearedObstruction to prevent UI blocking
      // await asyncClearedObstruction({ maxTime: 1000 });
    } catch (error) {
      console.error('Failed to get state from IndexedDB:', error);
      return undefined;
    }
  }

  /**
   * Transform special objects like Map and Set into a storable format
   */
  private transformForStorage<S>(value: S): any {
    if (value instanceof Map) {
      return {
        dataType: 'Map',
        value: Array.from(value.entries()),
      };
    }
    if (value instanceof Set) {
      return {
        dataType: 'Set',
        value: Array.from(value),
      };
    }
    if (Array.isArray(value)) {
      return value.map(item => this.transformForStorage(item));
    }
    if (value !== null && typeof value === 'object') {
      const result: Record<string, any> = {};
      for (const key in value) {
        if (Object.prototype.hasOwnProperty.call(value, key)) {
          result[key] = this.transformForStorage((value as any)[key]);
        }
      }
      return result;
    }
    return value;
  }

  /**
   * Transform stored data back into its original format
   */
  private transformFromStorage<S>(value: any): S {
    if (value && typeof value === 'object' && 'dataType' in value) {
      if (value.dataType === 'Map') {
        return new Map(value.value) as unknown as S;
      }
      if (value.dataType === 'Set') {
        return new Set(value.value) as unknown as S;
      }
    }
    if (Array.isArray(value)) {
      return value.map(item => this.transformFromStorage(item)) as unknown as S;
    }
    if (value !== null && typeof value === 'object') {
      const result: Record<string, any> = {};
      for (const key in value) {
        if (Object.prototype.hasOwnProperty.call(value, key)) {
          result[key] = this.transformFromStorage(value[key]);
        }
      }
      return result as unknown as S;
    }
    return value as S;
  }

  /**
   * Get the current state
   * @returns Current state value
   */
  getState(): T {
    return this.state;
  }

  /**
   * Update the state
   * @param updater - New state value or function to update state
   */
  setState(updater: T | ((prevState: T) => T)): void {
    const newState = typeof updater === 'function'
      ? (updater as Function)(this.state)
      : updater;
    
    this.state = newState;
    
    // Save to IndexedDB if persistence is enabled
    if (this.persistenceEnabled) {
      // Use asyncClearedObstruction to prevent UI blocking
      asyncClearedObstruction({ maxTime: 1000 }).then(() => {
        this.saveToIndexedDB(this.state).catch(console.error);
      });
    }
    
    this.notifyListeners();
  }

  /**
   * Register a listener for state changes
   * @param listener - Function to call when state changes
   * @returns Listener ID for unregistering
   */
  subscribe(listener: StateChangeListener<T>): string {
    const listenerId = generateId();
    this.listeners.set(listenerId, listener);
    
    // Immediately notify the new listener with current state
    listener(this.state);
    
    return listenerId;
  }

  /**
   * Unregister a listener
   * @param listenerId - ID of the listener to unregister
   * @returns True if the listener was found and removed
   */
  unsubscribe(listenerId: string): boolean {
    return this.listeners.delete(listenerId);
  }

  /**
   * Notify all listeners of state changes
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener(this.state);
      } catch (error) {
        console.error('Error in state change listener:', error);
      }
    });
  }

  /**
   * Get the number of active listeners
   * @returns Number of active listeners
   */
  getListenerCount(): number {
    return this.listeners.size;
  }

  /**
   * Reset the state to the initial value
   * @param initialState - Initial state value
   */
  resetState(initialState: T): void {
    this.state = initialState;
    
    if (this.persistenceEnabled) {
      asyncClearedObstruction({ maxTime: 1000 }).then(() => {
        this.saveToIndexedDB(this.state).catch(console.error);
      });
    }
    
    this.notifyListeners();
  }

  /**
   * Clear all listeners and remove this instance
   */
  cleanup(): void {
    this.listeners.clear();
    StateManager.instances.delete(this.id);
  }
} 