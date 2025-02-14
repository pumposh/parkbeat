import type { LocationInfo } from "@/types/types"

interface LocationInfoCardProps {
  isLoading: boolean
  location: { lat: number; lng: number } | null
  locationInfo?: LocationInfo
}

export const LocationInfoCard = ({ isLoading, location, locationInfo }: LocationInfoCardProps) => {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <i className="fa-solid fa-circle-notch fa-spin" aria-hidden="true" />
        <span>Finding location...</span>
      </div>
    )
  }

  if (locationInfo?.address) {
    const { street, neighborhood, city, state } = locationInfo.address
    const mainLocation = street || neighborhood
    const subLocation = city && state ? `${city}, ${state}` : city || state

    return (
      <div className="flex items-center justify-start gap-3 frosted-glass p-4 rounded-lg">
        <i className="fa-solid fa-location-dot mt-1 text-zinc-700 dark:text-zinc-300" aria-hidden="true" />
        <div>
          {mainLocation && (
            <p className="font-medium text-zinc-900 dark:text-zinc-100">
              {mainLocation}
            </p>
          )}
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
      <span>
        {location 
          ? "Location selected"
          : "Click on the map to select a location"}
      </span>
    </div>
  )
} 