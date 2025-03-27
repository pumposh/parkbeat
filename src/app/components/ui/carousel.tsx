import { useState, useEffect, useCallback, useRef } from 'react'
import { cn } from '@/lib/utils'

interface CarouselProps {
  images: Array<{
    src: string
    alt?: string
    label?: string
  }>
  className?: string
  onImageChange?: (index: number) => void
  showControls?: boolean
  showIndicators?: boolean
  autoPlay?: boolean
  interval?: number
}

export function Carousel({ 
  images, 
  className, 
  onImageChange,
  showControls = true,
  showIndicators = true,
  autoPlay = false,
  interval = 5000
}: CarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const transitionTimer = useRef<NodeJS.Timeout | null>(null)
  const autoPlayTimer = useRef<NodeJS.Timeout | null>(null)

  const goToImage = useCallback((index: number) => {
    if (isTransitioning || index === currentIndex) return
    setIsTransitioning(true)
    setCurrentIndex(index)
    onImageChange?.(index)
  }, [isTransitioning, currentIndex, onImageChange])

  const nextImage = useCallback(() => {
    if (images.length <= 1) return
    goToImage((currentIndex + 1) % images.length)
  }, [currentIndex, images.length, goToImage])

  const previousImage = useCallback(() => {
    if (images.length <= 1) return
    goToImage((currentIndex - 1 + images.length) % images.length)
  }, [currentIndex, images.length, goToImage])

  // Handle auto-play
  useEffect(() => {
    if (!autoPlay || isPaused || images.length <= 1) {
      if (autoPlayTimer.current) {
        clearInterval(autoPlayTimer.current)
      }
      return
    }

    autoPlayTimer.current = setInterval(nextImage, interval)
    return () => {
      if (autoPlayTimer.current) {
        clearInterval(autoPlayTimer.current)
      }
    }
  }, [autoPlay, isPaused, interval, images.length, nextImage])

  // Handle transition state
  useEffect(() => {
    if (isTransitioning) {
      if (transitionTimer.current) {
        clearTimeout(transitionTimer.current)
      }
      transitionTimer.current = setTimeout(() => setIsTransitioning(false), 500)
      return () => {
        if (transitionTimer.current) {
          clearTimeout(transitionTimer.current)
        }
      }
    }
  }, [isTransitioning])

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') previousImage()
      if (e.key === 'ArrowRight') nextImage()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [nextImage, previousImage])

  if (!images.length) return null

  return (
    <div 
      className={cn(
        "relative group carousel",
        "flex flex-col flex-grow",
        className
      )}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="overflow-hidden rounded-lg flex-grow">
        <div 
          className="relative aspect-[1/1] h-full flex transition-transform duration-500 ease-out"
          style={{
            transform: `translateX(-${currentIndex * 100}%)`,
          }}
        >
          {images.map((image, index) => (
            <div key={`${image.src}-${index}`} className="relative min-w-full h-full">
              <img
                src={image.src}
                alt={image.alt || `Image ${index + 1}`}
                className={cn(
                  "absolute inset-0 w-full h-full object-cover",
                  "transition-opacity duration-500",
                )}
                loading="lazy"
              />
              {image.label && (
                <div className={cn(
                  "absolute top-2 left-2 z-10",
                  "px-2 py-1 rounded bg-black/50 text-white text-sm",
                  "opacity-0 group-hover:opacity-100 transition-opacity"
                )}>
                  {image.label}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {showControls && images.length > 1 && (
        <>
          <button
            onClick={previousImage}
            className={cn(
              "absolute left-2 top-1/2 -translate-y-1/2",
              "p-2 rounded-full bg-black/50 text-white",
              "opacity-0 group-hover:opacity-100 transition-opacity",
              "hover:bg-black/70 focus:outline-none focus:ring-2 focus:ring-white/50",
              "disabled:opacity-0"
            )}
            disabled={isTransitioning}
            aria-label="Previous image"
          >
            <i className="fa-solid fa-chevron-left" />
          </button>
          <button
            onClick={nextImage}
            className={cn(
              "absolute right-2 top-1/2 -translate-y-1/2",
              "p-2 rounded-full bg-black/50 text-white",
              "opacity-0 group-hover:opacity-100 transition-opacity",
              "hover:bg-black/70 focus:outline-none focus:ring-2 focus:ring-white/50",
              "disabled:opacity-0"
            )}
            disabled={isTransitioning}
            aria-label="Next image"
          >
            <i className="fa-solid fa-chevron-right" />
          </button>

          <div className={cn(
            "absolute bottom-2 right-2",
            "px-2 py-1 rounded bg-black/50 text-white text-sm",
            "opacity-0 group-hover:opacity-100 transition-opacity"
          )}>
            {currentIndex + 1} / {images.length}
          </div>
        </>
      )}

      {showIndicators && images.length > 1 && (
        <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 p-2">
          {images.map((_, index) => (
            <button
              key={index}
              onClick={() => goToImage(index)}
              className={cn(
                "w-2 h-2 rounded-full transition-all duration-300",
                index === currentIndex 
                  ? "bg-white scale-100" 
                  : "bg-white/50 scale-75 hover:scale-90 hover:bg-white/70"
              )}
              disabled={isTransitioning}
              aria-label={`Go to image ${index + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  )
} 