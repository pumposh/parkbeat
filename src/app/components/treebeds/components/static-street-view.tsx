import { cn } from "@/lib/utils"
import { GradientBlur } from "../../ui/gradient-blur"
import { useEffect, useState } from "react"

interface StaticStreetViewProps {
  lat: number
  lng: number
  heading?: number
  pitch?: number
  zoom?: number
  onCapture?: (params: {
    lat: number
    lng: number
    heading: number
    pitch: number
    zoom: number
  }) => void | Promise<void>
  className?: string
}

export function StaticStreetView({ 
  lat, 
  lng, 
  heading = 0, 
  pitch = 0, 
  zoom = 1,
  onCapture,
  className 
}: StaticStreetViewProps) {
  const [isLoading, setIsLoading] = useState(true)

  // Generate URL for street view image
  // Using 16:9 aspect ratio (640x360) for better mobile display
  const imageUrl = `https://maps.googleapis.com/maps/api/streetview?size=1280x1920&location=${lat},${lng}&heading=${heading}&pitch=${pitch}&fov=120&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`

  // Reset loading state when location changes
  useEffect(() => {
    setIsLoading(true)
  }, [lat, lng, heading, pitch])

  const handleImageLoad = () => {
    setIsLoading(false)
  }

  return (
    <div className={cn("rounded-lg", className)}>
      <div className="flex items-center gap-3 text-sm text-zinc-700 dark:text-zinc-300 pb-3 border-b border-zinc-200/50 dark:border-white/10 p-4 pt-0">
        <i className="fa-solid fa-street-view" aria-hidden="true" />
        <span>Street view</span>
      </div>
      <div className="relative aspect-video">
        {/* Loading indicator */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/10 backdrop-blur-sm z-20 rounded-b-lg">
            <div className="flex items-center gap-3 text-white">
              <i className="fa-solid fa-circle-notch fa-spin" aria-hidden="true" />
              <span>Loading view...</span>
            </div>
          </div>
        )}

        <img 
          src={imageUrl} 
          alt="Street View"
          onLoad={handleImageLoad}
          className={cn(
            "w-full h-full object-cover rounded-b-lg",
            "transition-all duration-300",
            isLoading ? "opacity-0" : "opacity-100"
          )}
        />

        {/* Shadow gradient for contrast */}
        <div 
          className="absolute bottom-0 left-0 right-0 h-40 pointer-events-none z-10"
          style={{
            background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 70%)'
          }}
        />

        <div className="absolute pointer-events-none bottom-[-40px] h-[40%] w-full z-1">
          <GradientBlur targetBlur={2} direction="down" className="h-full w-full" />
        </div>
        
        {/* Shutter Button */}
        <button 
          onClick={() => {
            onCapture?.({
              lat,
              lng,
              heading,
              pitch,
              zoom
            })
          }}
          disabled={isLoading}
          className={cn(
            "absolute bottom-[8vw] left-1/2 -translate-x-1/2 z-10",
            "w-[20vw] h-[20vw] rounded-full flex items-center justify-center",
            "transition-all duration-200",
            !isLoading && "hover:scale-110",
            "focus:outline-none focus:ring-4 focus:ring-white/30",
            "drop-shadow-[0_4px_12px_rgba(0,0,0,0.4)]",
            // Outer ring
            "before:absolute before:inset-[-1.75vw] before:rounded-full before:border-[1vw]",
            "before:border-white/90",
            // Inner circle
            "after:absolute after:inset-[0.75vw] after:rounded-full",
            "after:bg-white/90",
            isLoading && "opacity-50 cursor-not-allowed"
          )}
          aria-label="Take photo"
        />
      </div>
    </div>
  )
} 