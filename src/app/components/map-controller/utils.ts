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

export async function getIpLocation(defaultLocation: { latitude: number, longitude: number }): Promise<IpLocation> {
  try {
    const response = await fetch('https://ipapi.co/json/')
    const data = await response.json() as IpApiResponse
    
    if (data.error || !data.latitude || !data.longitude || !data.city) {
      throw new Error('Invalid location data')
    }

    return {
      latitude: data.latitude,
      longitude: data.longitude,
      city: data.city
    }
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