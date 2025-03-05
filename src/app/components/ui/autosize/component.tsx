'use client'

import React, { useEffect, useRef, useState, ReactNode, CSSProperties, useId, useLayoutEffect } from 'react'

type AnchorPosition = 'start' | 'center' | 'end'

export interface AutosizeProps {
  children: ReactNode
  className?: string
  style?: CSSProperties
  onResize?: (dimensions: { width: number; height: number }) => void
  resizeDebounceMs?: number
  minWidth?: number | string
  minHeight?: number | string
  maxWidth?: number | string
  maxHeight?: number | string
  width?: number | string
  height?: number | string
  observeParent?: boolean
  observeChildren?: boolean
  disabled?: boolean
  id?: string // Allow custom ID to be passed
  anchorX?: AnchorPosition // Horizontal anchor position
  anchorY?: AnchorPosition // Vertical anchor position
}

/**
 * Autosize component that uses ResizeObserver to dynamically adjust its size
 * based on its children's dimensions.
 * Supports SSR with deterministic IDs.
 */
export const Autosize = ({
  children,
  className = '',
  style = {},
  onResize,
  resizeDebounceMs = 100,
  minWidth,
  minHeight,
  maxWidth,
  maxHeight,
  width,
  height,
  observeParent = false,
  observeChildren = true,
  disabled = false,
  id: customId,
  anchorX = 'start',
  anchorY = 'start'
}: AutosizeProps) => {
  // Use React's built-in useId hook for SSR-safe unique IDs
  const reactId = useId()
  
  // Use custom ID if provided, otherwise use React's ID
  const idRef = useRef<string>(customId || `autosize-${reactId.replace(/:/g, '-')}`)
  
  // These refs are used only on the client side
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const observedElementsRef = useRef<Set<Element>>(new Set())
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 })
  const [position, setPosition] = useState<CSSProperties>({})
  // State to track if we're mounted on the client
  const [isMounted, setIsMounted] = useState(false)
  
  // Check if we're running on the client
  const isClient = typeof window !== 'undefined'

  // Debounce function for resize events
  const debounce = (func: Function, delay: number) => {
    return function() {
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current)
      }
      resizeTimeoutRef.current = setTimeout(() => {
        func()
      }, delay)
    }
  }

  // Calculate position based on anchor values
  const calculatePosition = (newWidth?: number, newHeight?: number) => {
    const finalWidth = newWidth ?? width ?? dimensions.width
    const finalHeight = newHeight ?? height ?? dimensions.height

    if (finalWidth === undefined || finalHeight === undefined) {
      return {}
    }
    
    const positionStyles: CSSProperties = {}

    const transform = {
      x: 0,
      y: 0
    }
    
    // Apply content positioning based on anchor points
    if (anchorX === 'center') {
      positionStyles.left = '50%'
      transform.x = -50;
    } else if (anchorX === 'end') {
      positionStyles.right = 0
      transform.x = 0;
    } else {
      positionStyles.left = 0
      transform.x = 0;
    }
    
    if (anchorY === 'center') {
      positionStyles.top = '50%'
      transform.y = -50;
    } else if (anchorY === 'end') {
      positionStyles.bottom = 0
      transform.y = 0;
    } else {
      positionStyles.top = 0
      transform.y = 0;
    }

    positionStyles.transform = `translate(${transform.x}%, ${transform.y}%)`
    
    return positionStyles
  }

  // Calculate dimensions based on children
  const calculateDimensions = () => {
    if (!isClient || !contentRef.current || disabled) return

    const content = contentRef.current
    const rect = content.getBoundingClientRect()
    
    // Get all direct children
    const children = Array.from(content.children)
    
    // Calculate the total dimensions needed to fit all children
    let maxRight = 0
    let maxBottom = 0
    
    children.forEach(child => {
      const childRect = child.getBoundingClientRect()
      const right = childRect.left - rect.left + childRect.width
      const bottom = childRect.top - rect.top + childRect.height
      
      maxRight = Math.max(maxRight, right)
      maxBottom = Math.max(maxBottom, bottom)
    })
    
    const newDimensions = {
      width: maxRight,
      height: maxBottom
    }

    const position = calculatePosition(newDimensions.width, newDimensions.height)
    
    setDimensions(newDimensions)
    setPosition(position)
    onResize?.(newDimensions)
  }

  // Mark component as mounted on client-side
  useEffect(() => {
    setIsMounted(true)
    return () => setIsMounted(false)
  }, [])

  // Set up resize observer - only runs on client after mount
  useLayoutEffect(() => {
    if (!isClient || !isMounted || disabled) return

    // Clean up previous observers
    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect()
    }
    if (resizeTimeoutRef.current) {
      clearTimeout(resizeTimeoutRef.current)
    }
    observedElementsRef.current.clear()

    // Create resize observer
    resizeObserverRef.current = new ResizeObserver(debounce(() => {
      calculateDimensions()
    }, resizeDebounceMs))

    // Observe container if needed
    if (observeParent && containerRef.current) {
      resizeObserverRef.current.observe(containerRef.current)
      observedElementsRef.current.add(containerRef.current)
    }

    // Observe content if needed
    if (contentRef.current) {
      resizeObserverRef.current.observe(contentRef.current)
      observedElementsRef.current.add(contentRef.current)
    }

    // Observe children if needed
    if (observeChildren && contentRef.current) {
      Array.from(contentRef.current.children).forEach(child => {
        resizeObserverRef.current?.observe(child)
        observedElementsRef.current.add(child)
      })
    }

    // Initial calculation
    calculateDimensions()

    // Cleanup function
    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect()
      }
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current)
      }
      observedElementsRef.current.clear()
    }
  }, [children, disabled, observeParent, observeChildren, resizeDebounceMs, isMounted])

  // Update observer when children change - only runs on client after mount
  useLayoutEffect(() => {
    if (!isClient || !isMounted || disabled || !observeChildren || !contentRef.current || !resizeObserverRef.current) return

    // Get current children
    const currentChildren = Array.from(contentRef.current.children)
    
    // Remove observers for elements that are no longer children
    observedElementsRef.current.forEach(element => {
      if (!currentChildren.includes(element) && element !== containerRef.current && element !== contentRef.current) {
        resizeObserverRef.current?.unobserve(element)
        observedElementsRef.current.delete(element)
      }
    })
    
    // Add observers for new children
    currentChildren.forEach(child => {
      if (!observedElementsRef.current.has(child)) {
        resizeObserverRef.current?.observe(child)
        observedElementsRef.current.add(child)
      }
    })
    
    // Recalculate dimensions
    calculateDimensions()
  }, [children, disabled, observeChildren, isMounted])


  // Container style
  const containerStyle: CSSProperties = {
    position: 'relative',
    overflow: 'hidden',
    width: width !== undefined ? width : (isMounted && dimensions.width ? dimensions.width : 'auto'),
    height: height !== undefined ? height : (isMounted && dimensions.height ? dimensions.height : 'auto'),
    minWidth,
    minHeight,
    maxWidth,
    maxHeight,
    transition: 'width 0.3s ease-in-out, height 0.3s ease-in-out',
    ...style
  }

  // Content style - this is where we apply the anchor positioning
  const contentStyle: CSSProperties = {
    position: 'absolute',
    ...position
  }

  return (
    <div className={className}>
      <div 
        ref={containerRef}
        style={containerStyle}
        data-autosize-id={idRef.current}
        id={idRef.current}
        data-anchor-x={anchorX}
        data-anchor-y={anchorY}
      >
        <div ref={contentRef} style={contentStyle}>
          {children}
        </div>
      </div>
    </div>
  )
} 