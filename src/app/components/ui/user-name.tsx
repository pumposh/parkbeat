'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useUserAvatarCache } from './user-avatar-context';

interface UserNameProps {
  userId: string;
  className?: string;
  fallback?: string;
}

export function UserName({ userId, className, fallback = 'Contributor' }: UserNameProps) {
  const [userName, setUserName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { getUserName, setUserName: cacheUserName } = useUserAvatarCache();

  useEffect(() => {
    async function fetchUserData() {
      try {
        setLoading(true);
        
        // First, check if the user name is in the cache
        const cachedUserName = getUserName(userId);
        
        if (cachedUserName !== undefined) {
          // Found in cache, use it
          setUserName(cachedUserName);
          setLoading(false);
          return;
        }
        
        // Not found in cache, fetch from API
        const response = await fetch(`/api/users/${userId}`);
        if (!response.ok) throw new Error('Failed to fetch user data');
        
        const userData = await response.json() as { firstName?: string; lastName?: string };
        
        if (userData.firstName || userData.lastName) {
          const fullName = [userData.firstName, userData.lastName].filter(Boolean).join(' ');
          setUserName(fullName);
          // Store in cache for future use
          cacheUserName(userId, fullName);
        } else {
          setError(true);
          // Cache the null result too, to prevent unnecessary API calls
          cacheUserName(userId, null);
        }
      } catch (err) {
        console.error('Error fetching user name:', err);
        setError(true);
      } finally {
        setLoading(false);
      }
    }

    if (userId) {
      fetchUserData();
    }
  }, [userId, getUserName, cacheUserName]);

  // Show placeholder during loading or error
  if (loading) {
    return (
      <span className={cn("inline-block bg-gray-200 dark:bg-black/20 animate-pulse rounded h-4 w-24", className)} />
    );
  }

  if (error || !userName) {
    return <span className={className}>{fallback}</span>;
  }

  return <span className={className}>{userName}</span>;
} 