/**
 * This is a persistence system to support react state elements and synchronize them with IndexedDB
 *
 * @pumposh
 */

import { RefObject, useEffect, useRef, useState } from 'react';
import { asyncClearedObstruction } from '../lib/obstruction';
import objectHash from 'object-hash';

type Nullable<T> = T | null | undefined;

const isNullish = <T>(value: Nullable<T>): value is null | undefined =>
  value === null || value === undefined;

const DB_NAME = 'ParkbeatPersistentStore';
const STORE_NAME = 'persistentData';
const DB_VERSION = 1;

/**
 * Generate a unique key for a given value
 *
 * The initial value is used here to ensure if the expectation for the
 * data type is different than the actual data type stored in IndexedDB,
 * the hash will be different and thus hydration would fail.
 *
 * @param key - The key to use for storage
 * @param initialValue - The initial value to use for hashing
 */
function getKey<T>(key: string, initialValue: T) {
  const hash = objectHash({ key, initialValue });
  return `persist--${key}--${hash}`;
}

/** Transform special objects like Map and Set into a storable format */
function transformForStorage<T>(value: T): object | T {
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
    return value.map(transformForStorage);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, transformForStorage(v)]));
  }
  return value;
}

const isFlattenedMap = (
  value: unknown
): value is {
  dataType: 'Map';
  value: Iterable<[unknown, unknown]>;
} => !!value && typeof value === 'object' && 'dataType' in value && value.dataType === 'Map';

const isFlattenedSet = (
  value: unknown
): value is {
  dataType: 'Set';
  value: Iterable<unknown>;
} => !!value && typeof value === 'object' && 'dataType' in value && value.dataType === 'Set';

/** Transform stored data back into its original format including special objects */
function transformFromStorage<T>(value: unknown): T {
  if (value && typeof value === 'object') {
    if (isFlattenedMap(value)) {
      return new Map(value.value) as T;
    }
    if (isFlattenedSet(value)) {
      return new Set(value.value) as T;
    }
    if (Array.isArray(value)) {
      return value.map(transformFromStorage) as T;
    }
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, transformFromStorage(v)])
    ) as T;
  }
  return value as T;
}

// Native IndexedDB implementation
interface DBPromiseResult {
  db: IDBDatabase;
  close: () => void;
}

let dbPromise: Promise<DBPromiseResult> | null = null;

const getDB = async (): Promise<DBPromiseResult> => {
  if (!dbPromise) {
    dbPromise = new Promise<DBPromiseResult>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onerror = (event) => {
        reject(new Error('Failed to open database'));
      };
      
      request.onsuccess = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        resolve({
          db,
          close: () => {
            db.close();
            dbPromise = null;
          }
        });
      };
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
    });
  }
  return dbPromise;
};

const debounceTimeout = 200;
let debounceTimers: {
  [key: string]: ReturnType<typeof setTimeout> | null;
} = {};

/**
 * Saves a value to IndexedDB
 * @param key - The key to use for storage
 * @param value - The value to store
 */
const saveToIndexedDB = async <T>(key: string, value: T): Promise<void> => {
  // Skip if running on the server or indexedDB is not available
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
    console.warn('IndexedDB not available, skipping save operation');
    return;
  }

  const action = async () => {
    try {
      const { db } = await getDB();
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        
        let request: IDBRequest;
        if (isNullish(value)) {
          request = store.delete(key);
        } else {
          request = store.put(transformForStorage(value), key);
        }
        
        request.onerror = () => reject(new Error('Error saving to IndexedDB'));
        
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(new Error('Transaction error'));
      });
    } catch (error) {
      console.error('Error in saveToIndexedDB:', error);
      throw error;
    }
  };
  
  if (debounceTimers[key]) clearTimeout(debounceTimers[key] ?? 0);
  debounceTimers[key] = setTimeout(() => {
    action().catch(console.error);
  }, debounceTimeout);
};

/**
 * Retrieves a value from IndexedDB
 * @param key - The key to retrieve
 */
const getFromIndexedDB = async <T>(key: string): Promise<T | undefined> => {
  // Skip if running on the server or indexedDB is not available
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
    console.warn('IndexedDB not available, skipping get operation');
    return undefined;
  }

  try {
    const { db } = await getDB();
    return new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(key);
      
      request.onerror = () => reject(new Error('Error retrieving from IndexedDB'));
      request.onsuccess = () => {
        const value = request.result;
        resolve(value !== undefined ? transformFromStorage<T>(value) : undefined);
      };
    });
  } catch (error) {
    console.error('Error in getFromIndexedDB:', error);
    throw error;
  }
};

/**
 * Used to initialize a react state element and synchronize any changes with IndexedDB
 * @param key - The key to use for storage
 * @param defaultValue - The default value to use for the element
 * @param isInitialized - Whether the value has been initialized from IndexedDB
 * @param cleanup - A function to cleanup the value from IndexedDB
 * @returns A tuple containing the value and a setter function that syncs with IndexedDB
 */
export const usePersistentState = <T = any>(
  key: string,
  defaultValue: T
): [T, React.Dispatch<React.SetStateAction<T>>, boolean, () => void] => {
  const storageKey = getKey(key, defaultValue);

  // Check if we're running on the server side
  if (typeof window === 'undefined') {
    return [defaultValue, () => {}, false, () => {}];
  }

  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize state with a function to load from IndexedDB
  const [value, setValueInternal] = useState<T>(() => {
    // We can't use async/await in useState initializer, so we use a synchronous
    // approach first and update it later if needed
    const setValue = (newValue: T) => {
      setValueInternal(newValue);
      if (!isInitialized) return;
      // Prevent blocking UI
      asyncClearedObstruction({
        maxTime: 1000,
      }).then(() => {
        saveToIndexedDB(storageKey, newValue).catch(console.error);
      });
    };

    // Try to initialize from indexeddb
    getFromIndexedDB<T>(storageKey)
      .then(storedValue => {
        if (storedValue !== undefined) {
          setValueInternal(storedValue);
        } else {
          setValue(defaultValue);
        }
      })
      .catch(error => {
        console.error('Error initializing from IndexedDB:', error);
        setValue(defaultValue);
      })
      .finally(() => {
        setIsInitialized(true);
      });

    return defaultValue;
  });

  // Create a wrapped setter function that syncs with IndexedDB
  const setValue: React.Dispatch<React.SetStateAction<T>> = newValue => {
    const isFn = (fn: unknown): fn is <U>(...args: U[]) => T => typeof fn === 'function';
    const valueToStore = isFn(newValue) ? newValue(value) : newValue;
    setValueInternal(valueToStore);

    if (!isInitialized) return;
    saveToIndexedDB(storageKey, valueToStore).catch(console.error);
  };

  const cleanup = () => {
    saveToIndexedDB(storageKey, value);
    if (debounceTimers[storageKey]) clearTimeout(debounceTimers[storageKey] ?? 0);
  };

  return [value, setValue, isInitialized, cleanup];
};

export const usePersistentRef = <T>(
  key: string,
  defaultValue: T
): RefObject<T> & {
  isInitialized: boolean;
} => {
  const storageKey = getKey(key, defaultValue);
  
  const ref = useRef<T>(defaultValue);
  const [isInitialized, setIsInitialized] = useState(false);

  getFromIndexedDB<T>(storageKey).then(value => {
    ref.current = value ?? defaultValue;
    setIsInitialized(true);
  });

  useEffect(() => {
    saveToIndexedDB(storageKey, ref.current);

    return () => {
      saveToIndexedDB(storageKey, ref.current);
    };
  }, [ref.current]);
  
  return {
    ...ref,
    isInitialized,
  };
}