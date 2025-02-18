import type { LocationInfo, SuperLocationInfo } from "@/types/types"
import { type ReactNode } from "react"

interface LocationInfoCardProps {
  isLoading: boolean
  location: { lat: number; lng: number } | null
  locationInfo?: LocationInfo
  children?: ReactNode
}

interface LocationDisplay {
  mainLocation: string
  subLocation: string | null
}

function determineLocationInfo(locationInfo?: SuperLocationInfo): LocationDisplay {
  if (!locationInfo?.address) {
    return {
      mainLocation: "Selected Location",
      subLocation: null
    }
  }

  console.log(locationInfo)

  const address = locationInfo.address
  const features = locationInfo.features || []

  // Build location hierarchy from most specific to least specific
  const locationHierarchy: string[] = []

  // 1. Street level (most specific)
  if (address.street) {
    locationHierarchy.push(address.street)
  }

  // 2. Neighborhood level
  const neighborhood = address.neighborhood || 
    features.find(f => f.place_type?.includes('neighborhood'))?.place_name || null
  if (neighborhood) {
    locationHierarchy.push(neighborhood)
  }

  // 3. Municipality/City level
  const municipality = features.find(f => f.place_type?.includes('municipality'))?.place_name || null
  const city = address.city || municipality || null
  if (city) {
    // Special case for NYC - prefer neighborhood as main location
    const isNYC = city.toLowerCase().includes('new york')
    if (!isNYC || !neighborhood) {
      locationHierarchy.push(city)
    }
  }

  // 4. State level
  if (address.state) {
    locationHierarchy.push(address.state)
  }

  // 5. Country level (least specific)
  if (address.country) {
    locationHierarchy.push(address.country)
  }

  // Determine main and sub locations
  const mainLocation = locationHierarchy[0] || "Selected Location"
  let subLocation: string | null = null

  // Handle sub-location with special cases
  if (locationHierarchy.length > 1) {
    const secondLocation = locationHierarchy[1] || null
    if (secondLocation && city && address.state && secondLocation === city) {
      // Combine city and state for sub-location
      subLocation = `${city}, ${address.state}`
    } else if (secondLocation) {
      subLocation = secondLocation
    }
  }

  return {
    mainLocation,
    subLocation
  }
}

export const LocationInfoCard = ({ isLoading, location, locationInfo, children }: LocationInfoCardProps) => {
  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <i className="fa-solid fa-circle-notch fa-spin" aria-hidden="true" />
          <span>Finding location...</span>
        </div>
      )
    }

    if (location) {
      const { mainLocation, subLocation } = determineLocationInfo(locationInfo)
      
      return (
        <div className="flex items-center justify-start gap-3">
          <i className="fa-solid fa-location-dot mt-1 text-zinc-700 dark:text-zinc-300" aria-hidden="true" />
          <div>
            <p className="font-medium text-zinc-900 dark:text-zinc-100">
              {mainLocation}
            </p>
            {subLocation && (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {subLocation}
              </p>
            )}
          </div>
        </div>
      )
    }

    return (
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <i className="fa-solid fa-map-pin" aria-hidden="true" />
        <span>Click on the map to select a location</span>
      </div>
    )
  }

  return (
    <div className="frosted-glass rounded-lg space-y-0">
      <div className="p-4">
        {renderContent()}
      </div>
      {children}
    </div>
  )
} 