import type { LocationInfo, MapTilerResponse, NominatimResponse } from "../types/types"
export async function getLocationInfo(lat: number, lng: number, apiKey?: string): Promise<LocationInfo & Partial<NominatimResponse> & Partial<MapTilerResponse>> {
    let partialLocationInfo: LocationInfo = {
        coordinates: { lat, lng },
        timestamp: new Date().toISOString()
    }

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
      partialLocationInfo.address = nominatimData.address
      partialLocationInfo.placeType = nominatimData.type
      partialLocationInfo.displayName = nominatimData.display_name
      partialLocationInfo.boundingBox = nominatimData.boundingbox
      partialLocationInfo.importance = nominatimData.importance
      partialLocationInfo.osmType = nominatimData.osm_type
      partialLocationInfo.osmId = nominatimData.osm_id
      console.log('nominatimData', nominatimData)
  
      // MapTiler API for additional context like neighborhoods
      try {
        const key = apiKey || process.env.NEXT_PUBLIC_MAPTILER_API_KEY || process.env.MAPTILER_API_KEY
        const maptilerResponse = await fetch(
          `https://api.maptiler.com/geocoding/${lng},${lat}.json?key=${key}`
        )
        if (!maptilerResponse.ok) {
          throw new Error(`MapTiler API error: ${maptilerResponse.status} ${maptilerResponse.statusText} ${maptilerResponse.url} ${maptilerResponse.body}`)
        }
        const maptilerData = await maptilerResponse.json() as MapTilerResponse
        
        // Only merge MapTiler data if it's valid
          return {
          ...partialLocationInfo,
          ...maptilerData
        }
      } catch (error) {
        console.warn('MapTiler API error:', error)
        // Continue with just the Nominatim data
      }
  
      // Return what we have from Nominatim if MapTiler fails
      return partialLocationInfo
    } catch (error) {
      console.error('Error fetching location info:', error)
      // Return basic coordinates if all APIs fail
      return partialLocationInfo
    }
  }
  