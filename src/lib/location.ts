import type { LocationInfo, MapTilerResponse, NominatimResponse } from "../types/types"
export async function getLocationInfo(lat: number, lng: number): Promise<LocationInfo & Partial<NominatimResponse> & Partial<MapTilerResponse>> {
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
  
      // MapTiler API for additional context like neighborhoods
      const maptilerResponse = await fetch(
        `https://api.maptiler.com/geocoding/${lng},${lat}.json?key=${process.env.NEXT_PUBLIC_MAPTILER_API_KEY}`
      )
      const maptilerData = await maptilerResponse.json() as MapTilerResponse
  
      // Combine and normalize the data
      return {
        ...partialLocationInfo,
        ...maptilerData
      }
    } catch (error) {
      console.error('Error fetching location info:', error)
      // Return basic coordinates if APIs fail
      return partialLocationInfo
    }
  }
  