'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { useUserAvatarCache } from './user-avatar-context';

interface UserAvatarProps {
  userId: string;
  size?: number;
  className?: string;
}

export function UserAvatar({ userId, size = 40, className }: UserAvatarProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { getImageUrl, setImageUrl: cacheImageUrl } = useUserAvatarCache();

  useEffect(() => {
    async function fetchUserData() {
      try {
        setLoading(true);
        
        // First, check if the image URL is in the cache
        const cachedImageUrl = getImageUrl(userId);
        
        if (cachedImageUrl !== undefined) {
          // Found in cache, use it
          setImageUrl(cachedImageUrl);
          setLoading(false);
          return;
        }
        
        // Not found in cache, fetch from API
        const response = await fetch(`/api/users/${userId}`);
        if (!response.ok) throw new Error('Failed to fetch user data');
        
        const userData = await response.json() as { imageUrl: string };
        
        if (userData.imageUrl) {
          setImageUrl(userData.imageUrl);
          // Store in cache for future use
          cacheImageUrl(userId, userData.imageUrl);
        } else {
          setError(true);
          // Cache the null result too, to prevent unnecessary API calls
          cacheImageUrl(userId, null);
        }
      } catch (err) {
        console.error('Error fetching user avatar:', err);
        setError(true);
      } finally {
        setLoading(false);
      }
    }

    if (userId) {
      fetchUserData();
    }
  }, [userId, getImageUrl, cacheImageUrl]);

  // Show placeholder during loading or error
  if (loading) {
    return (
      <div 
        className={cn(
          "rounded-full bg-gray-200 animate-pulse flex items-center justify-center overflow-hidden",
          className
        )} 
        style={{ width: size, height: size }}
      />
    );
  }

  if (error || !imageUrl) {
    return (
      <div 
        className={cn(
          "rounded-full bg-gray-300 flex items-center justify-center overflow-hidden text-gray-500",
          className
        )} 
        style={{ width: size, height: size }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ width: size/2, height: size/2 }}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      </div>
    );
  }

  return (
    <div 
      className={cn(
        "rounded-full overflow-hidden outline outline-1 outline-white dark:outline-zinc-100/20 shadow-md scale-125",
        className
      )} 
      style={{ 
        width: size, 
        height: size,
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
      }}
    >
      <Image
        src={imageUrl}
        alt="User avatar"
        width={size * 1.5}
        height={size * 1.5}
        className="object-cover w-full h-full"
      />
    </div>
  );
}