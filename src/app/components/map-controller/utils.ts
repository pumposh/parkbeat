import type { IpApiResponse, IpLocation } from '@/types/types'

export const getMapStyle = (theme: string) => {
  let mapStyle = '07c51949-e44b-4615-a124-2b43121fc1d3'
  if (theme === 'dark') {
    mapStyle = '07c51949-e44b-4615-a124-2b43121fc1d3'
  }
  return `https://api.maptiler.com/maps/`
  + `${mapStyle}/style.json`
  + `?key=${process.env.NEXT_PUBLIC_MAPTILER_API_KEY}`
}

interface CachedLocation {
  data: IpLocation;
  timestamp: number;
}

const LOCATION_CACHE_KEY = 'parkbeat-ip-location';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

export async function getIpLocation(defaultLocation: { latitude: number, longitude: number }): Promise<IpLocation> {
  try {
    // Check if we have cached location data
    if (typeof window !== 'undefined' && window.localStorage) {
      const cachedData = localStorage.getItem(LOCATION_CACHE_KEY);
      
      if (cachedData) {
        const cached = JSON.parse(cachedData) as CachedLocation;
        const now = Date.now();
        
        // Use cached data if it's less than 5 minutes old
        if (now - cached.timestamp < CACHE_DURATION) {
          return cached.data;
        }
      }
    }

    // If no valid cache, fetch from API
    const response = await fetch('https://ipapi.co/json/')
    const data = await response.json() as IpApiResponse
    
    if (data.error || !data.latitude || !data.longitude || !data.city) {
      throw new Error('Invalid location data')
    }

    const locationData: IpLocation = {
      latitude: data.latitude,
      longitude: data.longitude,
      city: data.city
    }

    // Cache the result in localStorage
    if (typeof window !== 'undefined' && window.localStorage) {
      const cacheData: CachedLocation = {
        data: locationData,
        timestamp: Date.now()
      };
      localStorage.setItem(LOCATION_CACHE_KEY, JSON.stringify(cacheData));
    }

    return locationData;
  } catch (error) {
    console.warn('Failed to get location from IP:', error)
    // Default to New York if IP location fails
    return {
      latitude: defaultLocation.latitude,
      longitude: defaultLocation.longitude,
      city: 'New York'
    }
  }
} 