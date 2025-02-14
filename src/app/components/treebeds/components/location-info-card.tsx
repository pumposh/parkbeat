import type { LocationInfo } from "@/types/types"
import { type ReactNode } from "react"

interface LocationInfoCardProps {
  isLoading: boolean
  location: { lat: number; lng: number } | null
  locationInfo?: LocationInfo
  children?: ReactNode
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

    if (locationInfo?.address) {
      const { street, neighborhood, city, state } = locationInfo.address
      const mainLocation = street || neighborhood
      const subLocation = city && state ? `${city}, ${state}` : city || state

      return (
        <div className="flex items-center justify-start gap-3">
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

  return (
    <div className="frosted-glass rounded-lg space-y-0">
      <div className="p-4">
        {renderContent()}
      </div>
      {children}
    </div>
  )
} 