export interface MapControllerProps {
  initialCenter?: {
    latitude: number
    longitude: number
  }
  initialZoom?: number
  className?: string
}

export interface IpLocation {
  latitude: number
  longitude: number
  city: string
}

export interface IpApiResponse {
  latitude: number
  longitude: number
  city: string
  error?: boolean
}

export interface Pin {
  id: string
  lat: number
  lng: number
  type?: string
  data?: any
}

export interface LocationInfo {
  coordinates: {
    lat: number
    lng: number
  }
  address?: {
    street?: string
    houseNumber?: string
    neighborhood?: string
    city?: string
    state?: string
    country?: string
    postalCode?: string
  }
  placeType?: string
  displayName?: string
  boundingBox?: string[]
  importance?: number
  osmType?: string
  osmId?: string
  nameDetails?: Record<string, string>
  timestamp: string
}

export interface NominatimResponse {
  address?: {
    road?: string
    street?: string
    house_number?: string
    suburb?: string
    city?: string
    state?: string
    country?: string
    postcode?: string
  }
  type?: string
  display_name?: string
  boundingbox?: string[]
  importance?: number
  osm_type?: string
  osm_id?: string
  namedetails?: Record<string, string>
}

export interface MapTilerResponse {
  features?: Array<{
    context?: {
      neighborhood?: string
    }
    place_type?: string[]
    place_name?: string
  }>
}

export type SuperLocationInfo = LocationInfo & Partial<NominatimResponse> & Partial<MapTilerResponse>

export type ProjectCategory = 
  | 'urban_greening'
  | 'park_improvement'
  | 'community_garden'
  | 'playground'
  | 'public_art'
  | 'sustainability'
  | 'accessibility'
  | 'other' 