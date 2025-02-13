import type { LocationInfo } from "@/types/types"

interface LocationInfoCardProps {
  isLoading: boolean
  location: { lat: number; lng: number } | null
  locationInfo?: LocationInfo
}

export const LocationInfoCard = ({ isLoading, location, locationInfo }: LocationInfoCardProps) => {
  if (isLoading) {
    return (
      <div className="mt-2 flex items-center gap-2 text-sm text-zinc-500">
        <i className="fa-solid fa-circle-notch fa-spin" aria-hidden="true" />
        <span>Loading location details...</span>
      </div>
    )
  }

  if (locationInfo) {
    return (
      <div className="mt-2 space-y-1">
        <p className="text-sm text-zinc-900 dark:text-zinc-100">
          {locationInfo.displayName}
        </p>
        {locationInfo.address && (
          <div className="text-xs space-y-0.5 text-zinc-500 dark:text-zinc-400">
            {locationInfo.address.street && (
              <p>Street: {locationInfo.address.street}</p>
            )}
            {locationInfo.address.neighborhood && (
              <p>Neighborhood: {locationInfo.address.neighborhood}</p>
            )}
            <p>
              {[
                locationInfo.address.city,
                locationInfo.address.state,
                locationInfo.address.postalCode
              ].filter(Boolean).join(', ')}
            </p>
          </div>
        )}
        {location && (
          <p className="text-xs text-zinc-400">
            Coordinates: {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
          </p>
        )}
      </div>
    )
  }

  return (
    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
      {location 
        ? `Selected: ${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`
        : "Click on the map to select a location"}
    </p>
  )
} 