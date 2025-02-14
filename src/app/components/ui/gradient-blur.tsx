import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

const SLICE_SIZE = 20 // pixels - controls the size difference between each slice
const POSITION_INCREMENT = SLICE_SIZE / 2 // More overlap between slices
const POWER_CURVE = 0.5 // Higher = more exponential, lower = more linear

interface GradientBlurProps {
  targetBlur: number
  direction?: 'up' | 'down' | 'left' | 'right'
  className?: string
}

export function GradientBlur({ targetBlur, direction = 'up', className }: GradientBlurProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [layers, setLayers] = useState<number[]>([])

  useEffect(() => {
    if (!containerRef.current) return

    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        setDimensions({ width, height })

        const targetDimension = direction === 'up' || direction === 'down' ? height : width
        const numLayers = Math.floor(targetDimension / POSITION_INCREMENT)
        
        // Create array of exponentially increasing blur values
        const newLayers = Array.from({ length: numLayers }, (_, i) => {
          const progress = (i + 1) / numLayers
          // Use power curve to create exponential progression
          const exponentialProgress = Math.pow(progress, POWER_CURVE)
          return targetBlur * exponentialProgress
        })
        
        setLayers(newLayers)
      }
    })

    resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
    }
  }, [direction, targetBlur])

  const getLayerStyle = (blurAmount: number, index: number): React.CSSProperties => {
    const isVertical = direction === 'up' || direction === 'down'
    const size = isVertical ? dimensions.height : dimensions.width
    const layerSize = size - (index * SLICE_SIZE)
    const position = index * POSITION_INCREMENT
    const progress = index / (layers.length - 1)
    
    // Use same power curve for opacity to match blur progression
    const opacity = 0.85 + (0.15 * Math.pow(progress, POWER_CURVE))

    const baseStyle: React.CSSProperties = {
      position: 'absolute',
      backdropFilter: `blur(${blurAmount}px)`,
      WebkitBackdropFilter: `blur(${blurAmount}px)`,
      opacity,
      zIndex: index,
      transition: 'backdrop-filter 150ms ease-out, opacity 150ms ease-out'
    }

    switch (direction) {
      case 'up':
        return {
          ...baseStyle,
          top: position / POSITION_INCREMENT,
          left: 0,
          width: '100%',
          height: layerSize
        }
      case 'down':
        return {
          ...baseStyle,
          bottom: position / POSITION_INCREMENT,
          left: 0,
          width: '100%',
          height: layerSize
        }
      case 'left':
        return {
          ...baseStyle,
          top: 0,
          right: position * POSITION_INCREMENT,
          height: '100%',
          width: layerSize
        }
      case 'right':
        return {
          ...baseStyle,
          top: 0,
          left: position * POSITION_INCREMENT,
          height: '100%',
          width: layerSize
        }
      default:
        return baseStyle
    }
  }

  return (
    <div ref={containerRef} className={cn("relative overflow-hidden", className)}>
      {layers.map((blur, index) => (
        <div
          key={index}
          className="GradientBlurLayer"
          style={getLayerStyle(blur, index)}
          aria-hidden="true"
        />
      ))}
    </div>
  )
} 