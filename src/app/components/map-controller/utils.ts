import type { IpApiResponse, IpLocation, LocationInfo, NominatimResponse, MapTilerResponse } from './types'

export const getMapStyle = (theme: string) => {
  let mapStyle = '07c51949-e44b-4615-a124-2b43121fc1d3'
  if (theme === 'dark') {
    mapStyle = '07c51949-e44b-4615-a124-2b43121fc1d3'
  }
  return `https://api.maptiler.com/maps/`
  + `${mapStyle}/style.json`
  + `?key=${process.env.NEXT_PUBLIC_MAPTILER_API_KEY}`
}

export async function getLocationInfo(lat: number, lng: number): Promise<LocationInfo> {
  try {
    // OpenStreetMap Nominatim API for detailed location data
    const nominatimResponse = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&namedetails=1`,
      {
        headers: {
          'User-Agent': 'Parkbeat/1.0'
        }
      }
    )
    const nominatimData = await nominatimResponse.json() as NominatimResponse

    // MapTiler API for additional context like neighborhoods
    const maptilerResponse = await fetch(
      `https://api.maptiler.com/geocoding/${lng},${lat}.json?key=${process.env.NEXT_PUBLIC_MAPTILER_API_KEY}`
    )
    const maptilerData = await maptilerResponse.json() as MapTilerResponse

    // Combine and normalize the data
    return {
      coordinates: {
        lat,
        lng
      },
      address: {
        street: nominatimData.address?.road || nominatimData.address?.street,
        houseNumber: nominatimData.address?.house_number,
        neighborhood: maptilerData.features?.[0]?.context?.neighborhood || nominatimData.address?.suburb,
        city: nominatimData.address?.city,
        state: nominatimData.address?.state,
        country: nominatimData.address?.country,
        postalCode: nominatimData.address?.postcode,
      },
      placeType: nominatimData.type,
      displayName: nominatimData.display_name,
      boundingBox: nominatimData.boundingbox,
      importance: nominatimData.importance,
      osmType: nominatimData.osm_type,
      osmId: nominatimData.osm_id,
      nameDetails: nominatimData.namedetails,
      timestamp: new Date().toISOString()
    }
  } catch (error) {
    console.error('Error fetching location info:', error)
    // Return basic coordinates if APIs fail
    return {
      coordinates: { lat, lng },
      timestamp: new Date().toISOString()
    }
  }
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
    console.error('Failed to get location from IP:', error)
    // Default to New York if IP location fails
    return {
      latitude: defaultLocation.latitude,
      longitude: defaultLocation.longitude,
      city: 'New York'
    }
  }
} 