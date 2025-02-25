'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

// Type for the cache entries
interface CacheEntry {
  value: string | null;
  timestamp: number;
}

// Interface for the context
interface UserAvatarCacheContextType {
  getImageUrl: (userId: string) => string | null | undefined;
  setImageUrl: (userId: string, url: string | null) => void;
  getUserName: (userId: string) => string | null | undefined;
  setUserName: (userId: string, name: string | null) => void;
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

  // Get image URL from cache
  const getImageUrl = (userId: string) => {
    const entry = imageUrlCache[userId];
    
    // If entry exists and hasn't expired
    if (entry && Date.now() - entry.timestamp < CACHE_EXPIRATION) {
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
        timestamp: Date.now()
      }
    }));
  };
  
  // Get user name from cache
  const getUserName = (userId: string) => {
    const entry = userNameCache[userId];
    
    // If entry exists and hasn't expired
    if (entry && Date.now() - entry.timestamp < CACHE_EXPIRATION) {
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
        timestamp: Date.now()
      }
    }));
  };

  return (
    <UserAvatarCacheContext.Provider value={{ getImageUrl, setImageUrl, getUserName, setUserName }}>
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