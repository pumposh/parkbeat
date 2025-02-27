'use client';

import { createContext, useContext, useState, ReactNode, useCallback, useRef } from 'react';
import { HydratableDate as Date } from '@/lib/utils'
import { asyncTimeout } from '@/lib/async';

// Type for the cache entries
interface CacheEntry {
  value: string | null;
  timestamp: number;
}

// Type for user data
interface UserData {
  imageUrl: string | null;
  name?: string | null;
  firstName?: string;
  lastName?: string;
  username?: string;
}

// Interface for the context
interface UserAvatarCacheContextType {
  getImageUrl: (userId: string) => string | null | undefined;
  getUserName: (userId: string) => string | null | undefined;
  getUserData: (userId: string) => Promise<UserData>;
}

// Create the context
const UserAvatarCacheContext = createContext<UserAvatarCacheContextType | undefined>(undefined);

// Cache expiration time - 10 minutes (in milliseconds)
const CACHE_EXPIRATION = 10 * 60 * 1000;

// Provider component
export function UserAvatarCacheProvider({ children }: { children: ReactNode }) {
  // Cache for image URLs
  const [imageUrlCache, setImageUrlCache] = useState<Record<string, CacheEntry>>({});
  
  // Cache for user names
  const [userNameCache, setUserNameCache] = useState<Record<string, CacheEntry>>({});
  
  // Track ongoing fetch promises to prevent duplicate requests
  const fetchPromises = useRef<Record<string, Promise<UserData>>>({});
  
  const getNearestMinute = () => Math.floor(Date.now() / 60000) * 60000;

  // Get image URL from cache
  const getImageUrl = (userId: string) => {
    const entry = imageUrlCache[userId];
    
    // If entry exists and hasn't expired
    const isExpired = entry && getNearestMinute() - entry.timestamp > CACHE_EXPIRATION;

    if (entry && !isExpired) {
      return entry.value;
    }
    
    // Entry doesn't exist or has expired
    return undefined;
  };

  // Set image URL in cache
  const setImageUrl = (userId: string, url: string | null) => {
    setImageUrlCache(prev => ({
      ...prev,
      [userId]: {
        value: url,
        timestamp: getNearestMinute()
      }
    }));
  };
  
  // Get user name from cache
  const getUserName = (userId: string) => {
    const entry = userNameCache[userId];
    
    // If entry exists and hasn't expired
    if (entry && new Date().getTime() - entry.timestamp < CACHE_EXPIRATION) {
      return entry.value;
    }
    
    // Entry doesn't exist or has expired
    return undefined;
  };
  
  // Set user name in cache
  const setUserName = (userId: string, name: string | null) => {
    setUserNameCache(prev => ({
      ...prev,
      [userId]: {
        value: name,
        timestamp: new Date().getTime() 
      }
    }));
  };

  // Process user data to extract name information
  const processUserData = (userData: any): UserData => {
    const result: UserData = {
      imageUrl: userData.imageUrl || null,
    };
    
    // Process name information
    if (userData.name) {
      result.name = userData.name;
    } else if (userData.firstName || userData.lastName) {
      const fullName = [userData.firstName, userData.lastName].filter(Boolean).join(' ');
      result.name = fullName;
      result.firstName = userData.firstName;
      result.lastName = userData.lastName;
    } else if (userData.username) {
      // If only username is available, format it with @ prefix for display
      result.name = `@${userData.username}`;
      result.username = userData.username;
    }
    
    return result;
  };

  // Get or fetch user data
  const getUserData = useCallback(async (userId: string): Promise<UserData> => {
    // First check if we already have the data in cache
    const cachedImageUrl = getImageUrl(userId);
    const cachedUserName = getUserName(userId);
    
    if (cachedImageUrl !== undefined || cachedUserName !== undefined) {
      return { 
        imageUrl: cachedImageUrl !== undefined ? cachedImageUrl : null, 
        name: cachedUserName !== undefined ? cachedUserName : null 
      };
    }

    await asyncTimeout(0);
    
    // Check if there's already a fetch in progress for this user
    if (fetchPromises.current[userId]) {
      console.log('Fetch already in progress for user', userId);
      return fetchPromises.current[userId];
    }
    
    console.log('Fetching user data for user', userId);
    // Create a new fetch promise
    const fetchPromise = (async () => {
      try {
        const response = await fetch(`/api/users/${userId}`);
        if (!response.ok) throw new Error('Failed to fetch user data');
        
        const rawUserData = await response.json();
        const userData = processUserData(rawUserData);
        
        // Cache the results
        setImageUrl(userId, userData.imageUrl);
        if (userData.name) {
          setUserName(userId, userData.name);
        }
        
        return userData;
      } catch (err) {
        console.error('Error fetching user data:', err);
        // Cache the error result to prevent repeated failed requests
        setImageUrl(userId, null);
        setUserName(userId, null);
        return { imageUrl: null, name: null };
      } finally {
        // Remove this promise from the tracking object when done
        delete fetchPromises.current[userId];
      }
    })();
    
    // Store the promise in our tracking object
    fetchPromises.current = {
      ...fetchPromises.current,
      [userId]: fetchPromise
    };
    
    return fetchPromise;
  }, [fetchPromises]);

  return (
    <UserAvatarCacheContext.Provider value={{ 
      getImageUrl, 
      getUserName,
      getUserData
    }}>
      {children}
    </UserAvatarCacheContext.Provider>
  );
}

// Hook to use the context
export function useUserAvatarCache() {
  const context = useContext(UserAvatarCacheContext);
  if (context === undefined) {
    throw new Error('useUserAvatarCache must be used within a UserAvatarCacheProvider');
  }
  return context;
} 