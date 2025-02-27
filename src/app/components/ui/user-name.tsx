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
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { getUserName, getUserData } = useUserAvatarCache();

  useEffect(() => {
    if (!userId) return;

    // First check if we already have the user name in cache
    const cachedUserName = getUserName(userId);
    if (cachedUserName !== undefined) {
      setDisplayName(cachedUserName);
      setLoading(false);
      return;
    }

    // If not in cache, fetch it using the centralized method
    let isMounted = true;
    setLoading(true);

    getUserData(userId)
      .then(userData => {
        if (!isMounted) return;
        setDisplayName(userData.name || null);
        setError(!userData.name);
        setLoading(false);
      })
      .catch(() => {
        if (isMounted) {
          setError(true);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [userId, getUserName, getUserData]);

  // Show placeholder during loading or error
  if (loading) {
    return (
      <span className={cn("inline-block bg-gray-200 dark:bg-black/20 animate-pulse rounded h-4 w-24", className)} />
    );
  }

  if (displayName) {
    return <span className={className}>{displayName}</span>;
  }

  return <span className={className}>{fallback}</span>;
} 