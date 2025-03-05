'use client'

import { useState, useRef, useEffect, ReactNode, useMemo } from 'react'
import { cn } from '@/lib/utils'
import styles from './carousel-tabs.module.css'
import { isNullish } from '@/lib/nullable'

export interface Tab {
  id: string
  label: string
  content: ReactNode
  skeleton?: ReactNode
  icon?: string | ReactNode
  className?: string
  footerExtension?: ReactNode
  footerExtensionClassName?: string
}

interface CarouselTabsProps {
  tabs: Tab[]
  className?: string
  tabClassName?: string
  contentClassName?: string
  onChange?: (index: number) => void
  currentTabIndex?: number
  adaptiveHeight?: boolean
  tabPosition?: 'top' | 'bottom' | 'none'
}

export function CarouselTabs({
  tabs,
  className,
  tabClassName,
  contentClassName,
  onChange,
  currentTabIndex,
  adaptiveHeight = true,
  tabPosition = 'top',
}: CarouselTabsProps) {
  const [activeTabIndex, setActiveTabIndex] = useState(currentTabIndex ?? 0)
  const [hasScrollableContent, setHasScrollableContent] = useState<Record<number, boolean>>({})
  const [scrollPosition, setScrollPosition] = useState<Record<number, 'middle' | 'top' | 'bottom'>>({})
  const [displayFooter, setDisplayFooter] = useState(false)
  const [footerExtension, setFooterExtension] = useState<ReactNode | null>(null)
  
  // Height-related state
  const [contentHeights, setContentHeights] = useState<Record<number, number>>({})
  const [interpolatedHeight, setInterpolatedHeight] = useState<number | null>(null)
  const [isScrolling, setIsScrolling] = useState(false)
  const scrollingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  
  // References
  const tabsContainerRef = useRef<HTMLDivElement>(null)
  const carouselRef = useRef<HTMLDivElement>(null)
  const heightContainerRef = useRef<HTMLDivElement>(null)
  const contentRefs = useRef<(HTMLDivElement | null)[]>(tabs.map(() => null))
  const contentElementRefs = useRef<(HTMLElement | null)[]>(tabs.map(() => null))
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  
  // Handle tab click
  const handleTabClick = (index: number) => {
    setActiveTabIndex(index)
    onChange?.(index)
    
    // Scroll to tab
    if (carouselRef.current) {
      const tabElement = contentRefs.current[index]
      tabElement?.scrollIntoView({ behavior: 'smooth', inline: 'start' })
    }
  }
  
    
  // Calculate maximum height based on container position
  // This accounts for the space taken by tab buttons and other UI elements
  const calculateMaxHeight = (viewportHeight: number) => {
    if (!heightContainerRef.current || !tabsContainerRef.current) return viewportHeight * 0.8
    
    const containerRect = heightContainerRef.current.getBoundingClientRect()
    const tabsHeight = tabPosition !== 'none' ? tabsContainerRef.current.clientHeight : 0
    
    // For top position, consider space below the container top position
    // For bottom position, consider space above the footer
    // Apply a small padding (e.g., 32px) for visual comfort
    const padding = 32
    let maxHeight

    if (tabPosition === 'top' || tabPosition === 'bottom') {
      maxHeight = containerRect.bottom - padding - tabsHeight
    } else {
      maxHeight = viewportHeight - containerRect.top - padding
    }
    
    return Math.max(200, maxHeight) // Ensure a reasonable minimum height
  }
  
  const maxHeight = useMemo(() => {
    return calculateMaxHeight(window.innerHeight)
  }, [window.innerHeight, heightContainerRef])

  // Handle scroll in the carousel
  const handleCarouselScroll = () => {
    if (!carouselRef.current || !adaptiveHeight) return
    
    // Set scrolling state to disable transitions during active scrolling
    setIsScrolling(true)
    
    // Clear any existing timeout
    if (scrollingTimeoutRef.current) {
      clearTimeout(scrollingTimeoutRef.current)
    }
    
    const { scrollLeft, clientWidth } = carouselRef.current
    
    // Calculate which tabs we're between
    const rawProgress = scrollLeft / clientWidth
    
    // Find the indices of the tabs we're between
    const leftIndex = Math.floor(rawProgress)
    const rightIndex = Math.min(leftIndex + 1, tabs.length - 1)
    
    // Calculate progress between the tabs (0-1)
    const progress = rawProgress - leftIndex
    
    // Get heights for the tabs we're between
    const leftHeight = contentHeights[leftIndex] || 0
    const rightHeight = contentHeights[rightIndex] || 0
    
    // Only interpolate if both heights are available and valid
    if (leftHeight > 0 && rightHeight > 0) {
      // Linear interpolation between the two heights
      const newHeight = leftHeight + (rightHeight - leftHeight) * progress
      const minHeight = calculateMaxHeight(window.innerHeight)
      setInterpolatedHeight(Math.min(newHeight, minHeight))
    }
    
    // Detect when we've snapped to a tab
    const snapIndex = Math.round(rawProgress)
    if (snapIndex !== activeTabIndex && snapIndex >= 0 && snapIndex < tabs.length) {
      setActiveTabIndex(snapIndex)
      onChange?.(snapIndex)
    }
    
    // Set a timeout to handle the end of scrolling
    scrollingTimeoutRef.current = setTimeout(() => {
      setIsScrolling(false)
      setInterpolatedHeight(null) // Clear interpolated height to use the actual tab height
      
      // Update active tab if it changed
      const newIndex = Math.round(scrollLeft / clientWidth)
      if (newIndex !== activeTabIndex && newIndex >= 0 && newIndex < tabs.length) {
        setActiveTabIndex(newIndex)
        onChange?.(newIndex)
      }
    }, 150)
  }
  
  // Handle content scroll to apply mask
  const handleContentScroll = (e: React.UIEvent<HTMLElement>, tabIndex: number) => {
    const target = e.currentTarget
    checkScrollPosition(target, tabIndex)
  }
  
  // Check scroll position to determine mask
  const checkScrollPosition = (element: HTMLElement, tabIndex: number) => {
    if (!element) return
    
    const { scrollTop, scrollHeight, clientHeight } = element
    
    const viewportHeight = window.innerHeight
    const maxHeight = calculateMaxHeight(viewportHeight)

    // Update scrollable state
    const isScrollable = scrollHeight > (maxHeight ?? clientHeight)
    setHasScrollableContent(prev => ({ ...prev, [tabIndex]: isScrollable }))
    
    // Only evaluate scroll position if content is actually scrollable
    if (isScrollable) {
      const isAtTop = scrollTop <= 3
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 3
      
      if (isAtTop) {
        setScrollPosition(prev => ({ ...prev, [tabIndex]: 'top' }))
      } else if (isAtBottom) {
        setScrollPosition(prev => ({ ...prev, [tabIndex]: 'bottom' }))
      } else {
        setScrollPosition(prev => ({ ...prev, [tabIndex]: 'middle' }))
      }
    } else {
      // Not scrollable, so it's technically both at top and bottom
      setScrollPosition(prev => ({ ...prev, [tabIndex]: 'top' }))
    }
  }
  
  // Set up resize observer to measure content heights and detect scrollable content
  useEffect(() => {
    if (!adaptiveHeight) return
    
    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect()
    }
    
    resizeObserverRef.current = new ResizeObserver(entries => {
      const heightUpdates: Record<number, number> = {}
      
      entries.forEach(entry => {
        const tabIndex = contentElementRefs.current.findIndex(el => el === entry.target)
        
        if (tabIndex !== -1) {
          // Store height for this tab
          const height = entry.target.scrollHeight
          if (height > 0) {
            heightUpdates[tabIndex] = height
          }
          
          // Check if content is scrollable
          const isScrollable = entry.target.scrollHeight > entry.target.clientHeight
          setHasScrollableContent(prev => ({ ...prev, [tabIndex]: isScrollable }))
          
          // If content is scrollable, check initial scroll position
          if (isScrollable) {
            checkScrollPosition(entry.target as HTMLElement, tabIndex)
          }
        }
      })
      
      // Update heights if we have any
      if (Object.keys(heightUpdates).length > 0) {
        setContentHeights(prev => ({ ...prev, ...heightUpdates }))
      }
    })
    
    // Observe content elements
    contentRefs.current.forEach((ref, index) => {
      if (ref) {
        const contentElement = ref.firstElementChild as HTMLElement
        
        if (contentElement) {
          contentElementRefs.current[index] = contentElement
          resizeObserverRef.current?.observe(contentElement)
        }
      }
    })
    
    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect()
      }
      
      if (scrollingTimeoutRef.current) {
        clearTimeout(scrollingTimeoutRef.current)
      }
    }
  }, [adaptiveHeight, tabs.length])
  
  // Add window resize handler to recalculate height constraints
  useEffect(() => {
    // Function to handle window resize
    const handleResize = () => {
      // Force a re-render to recalculate maximum height
      setContentHeights(prev => ({ ...prev }))
      
      // If we're on the active tab, ensure correct scroll position
      if (carouselRef.current) {
        const { clientWidth } = carouselRef.current
        carouselRef.current.scrollTo({
          left: clientWidth * activeTabIndex,
          behavior: 'smooth'
        })
      }
    }
    
    window.addEventListener('resize', handleResize)
    
    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [activeTabIndex])
  
  // Handle parent updates to currentTabIndex
  useEffect(() => {
    if (currentTabIndex !== activeTabIndex && !isNullish(currentTabIndex)) {
      setActiveTabIndex(currentTabIndex)
      onChange?.(currentTabIndex)
      
      // Scroll to the tab without triggering the scroll handler
      if (carouselRef.current) {
        const tabElement = contentRefs.current[currentTabIndex]
        tabElement?.scrollIntoView({ behavior: 'smooth', inline: 'start' })
      }
    }
  }, [currentTabIndex, activeTabIndex])
  
  // Update footer extension
  const footerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (tabs[activeTabIndex]?.footerExtension) {
      setFooterExtension(tabs[activeTabIndex].footerExtension)
      footerTimeoutRef.current = setTimeout(() => {
        setDisplayFooter(true)
      }, 300)
    } else {
      setDisplayFooter(false)
      footerTimeoutRef.current = setTimeout(() => {
        setFooterExtension(null)
      }, 300)
    }

    return () => {
      if (footerTimeoutRef.current) {
        clearTimeout(footerTimeoutRef.current)
      }
    }
  }, [activeTabIndex, tabs])
  
  // Render tab buttons
  const renderTabButtons = () => {
    if (tabPosition === 'none') return null
    
    return tabs.map((tab, index) => (
      <button
        key={tab.id}
        className={cn(
          styles.tabButton,
          activeTabIndex === index ? styles.tabButtonActive : styles.tabButtonInactive,
          tabClassName
        )}
        onClick={() => handleTabClick(index)}
        aria-selected={activeTabIndex === index}
        role="tab"
      >
        {tab.icon && <span className="text-base">{tab.icon}</span>}
        <span className="font-light font-display tracking-wide text-[10px] leading-none">{tab.label}</span>
      </button>
    ))
  }
  
  // Calculate the height to use for the container
  const getContainerHeight = () => {
    if (!adaptiveHeight) return 'auto'
    
    // When scrolling, use the interpolated height, but cap it to max possible height
    if (isScrolling && interpolatedHeight !== null) {
      return `${interpolatedHeight}px`
    }
    
    // Get current viewport height
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 0
    
    const maxPossibleHeight = calculateMaxHeight(viewportHeight)
    
    // Otherwise use the height of the active tab, capped to max possible height
    const activeTabHeight = contentHeights[activeTabIndex]
    if (activeTabHeight && activeTabHeight > 0) {
      return `${Math.min(activeTabHeight, maxPossibleHeight)}px`
    }
    
    // Fallback height if nothing is available
    return `${maxPossibleHeight}px`
  }
  
  return (
    <div className={cn("flex flex-col overflow-hidden relative", className)}>
      {/* Tab headers - top position */}
      {tabPosition === 'top' && (
        <div className="relative">
          <div 
            ref={tabsContainerRef}
            className={cn(
              "frosted-glass rounded-2xl px-3 py-1 flex items-center justify-around shadow-sm",
              styles.tabsContainer
            )}
            role="tablist"
          >
            {renderTabButtons()}
          </div>
        </div>
      )}
      
      {/* Height container wrapper */}
      <div
        ref={heightContainerRef}
        className={cn(
          styles.heightContainer,
          isScrolling && styles.heightContainerScrolling
        )}
        style={{ 
          height: getContainerHeight(),
        }}
      >
        {/* Carousel content */}
        <div 
          ref={carouselRef}
          className={cn(
            styles.carouselContainer,
            contentClassName
          )}
          onScroll={handleCarouselScroll}
        >
          {tabs.map((tab, index) => (
            <div 
              key={tab.id}
              ref={el => {contentRefs.current[index] = el}}
              className={cn(
                styles.carouselItem,
                tab.className
              )}
              style={{ 
                maxHeight
              }}
              role="tabpanel"
              aria-labelledby={tab.id}
              hidden={activeTabIndex !== index && !isScrolling}
            >
              <div 
                className={cn(
                  styles.scrollableContent,
                  hasScrollableContent[index] && styles.scrollableMask,
                  hasScrollableContent[index] && "pb-8",
                  hasScrollableContent[index] && scrollPosition[index] === 'top'
                    && styles.scrollableMaskTop,
                  hasScrollableContent[index] && scrollPosition[index] === 'bottom'
                    && styles.scrollableMaskBottom
                  // hasScrollableContent[index] && "overflow-y-auto max-h-full"
                )}
                onScroll={(e) => handleContentScroll(e, index)}
              >
                {tab.content}
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {/* Tab headers - bottom position */}
      {tabPosition === 'bottom' && (
        <div className="relative mt-auto max-w-full">
          {footerExtension && (
            <div className={cn(
              styles.footerExtension,
              displayFooter ? styles.footerExtensionVisible : styles.footerExtensionHidden,
              tabs[activeTabIndex]?.footerExtensionClassName
            )}>
              {footerExtension}
            </div>
          )}
          <div 
            ref={tabsContainerRef}
            className={cn(
              "rounded-2xl mx-3 mb-1 px-3 py-1 flex items-center justify-around shadow-sm",
              'frosted-glass',
              styles.tabsContainer
            )}
            role="tablist"
          >
            {renderTabButtons()}
          </div>
        </div>
      )}
    </div>
  )
} 