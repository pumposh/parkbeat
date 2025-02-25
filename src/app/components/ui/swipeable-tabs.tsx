'use client'

import { useState, useRef, useEffect, ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface Tab {
  id: string
  label: string
  content: ReactNode
  icon?: string | ReactNode
  className?: string
}

interface SwipeableTabsProps {
  tabs: Tab[]
  className?: string
  tabClassName?: string
  contentClassName?: string
  onChange?: (index: number) => void
  defaultTabIndex?: number
  adaptiveHeight?: boolean
  tabPosition?: 'top' | 'bottom'
}

export function SwipeableTabs({
  tabs,
  className,
  tabClassName,
  contentClassName,
  onChange,
  defaultTabIndex = 0,
  adaptiveHeight = true,
  tabPosition = 'top'
}: SwipeableTabsProps) {
  const [activeTabIndex, setActiveTabIndex] = useState(defaultTabIndex)
  const [isDragging, setIsDragging] = useState(false)
  const [startX, setStartX] = useState(0)
  const [scrollLeft, setScrollLeft] = useState(0)
  const [isScrolling, setIsScrolling] = useState(false)
  const [contentHeight, setContentHeight] = useState<number | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const tabsContainerRef = useRef<HTMLDivElement>(null)
  const tabContentRefs = useRef<(HTMLDivElement | null)[]>(tabs.map(() => null))
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  
  // Update content height based on active tab
  const updateContentHeight = (targetIndex?: number) => {
    if (!adaptiveHeight) return;
    
    const activeTabContent = tabContentRefs.current[targetIndex ?? activeTabIndex];
    if (activeTabContent) {
      // Get the first child of the tab content div
      const contentElement = activeTabContent.firstElementChild as HTMLElement;
      if (contentElement) {
        // Use scrollHeight to get the full height including overflow
        const height = contentElement.scrollHeight;
        setContentHeight(height);
      }
    }
  };

  // Handle tab click
  const handleTabClick = (index: number) => {
    // Scroll to the tab content
    if (scrollContainerRef.current) {
      const containerWidth = scrollContainerRef.current.clientWidth
      scrollContainerRef.current.scrollTo({
        left: containerWidth * index,
        behavior: 'smooth'
      })
    }
    setTimeout(() => {
      setActiveTabIndex(index)
      onChange?.(index)
    }, 300)
  }
  
  // Handle scroll events to update active tab based on scroll position
  const handleScroll = () => {
    if (scrollContainerRef.current && !isDragging) {
      // Set scrolling state to true
      setIsScrolling(true)
      
      // Clear any existing timeout
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }
      
      // Set a timeout to handle the end of scrolling
      scrollTimeoutRef.current = setTimeout(() => {
        if (scrollContainerRef.current) {
          const { scrollLeft, clientWidth } = scrollContainerRef.current
          const newIndex = Math.round(scrollLeft / clientWidth)
          
          // Only update if the index has changed and is within bounds
          if (newIndex !== activeTabIndex && newIndex >= 0 && newIndex < tabs.length) {
            setActiveTabIndex(newIndex)
            onChange?.(newIndex)
            
            // Snap to the nearest tab after scrolling stops
            scrollContainerRef.current.scrollTo({
              left: clientWidth * newIndex,
              behavior: 'smooth'
            })
          }
        }
        setIsScrolling(false)
      }, 150) // Debounce time
    }
  }
  
  // Mouse/Touch event handlers for dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true)
    setStartX(e.pageX - (scrollContainerRef.current?.offsetLeft || 0))
    setScrollLeft(scrollContainerRef.current?.scrollLeft || 0)
  }
  
  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true)
    if (e.touches[0] && scrollContainerRef.current) {
      setStartX(e.touches[0].pageX - (scrollContainerRef.current.offsetLeft || 0))
      setScrollLeft(scrollContainerRef.current.scrollLeft || 0)
    }
  }
  
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return
    e.preventDefault()
    
    const x = e.pageX - (scrollContainerRef.current?.offsetLeft || 0)
    const walk = (x - startX) * 2 // Scroll speed multiplier
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft = scrollLeft - walk
    }
  }
  
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return
    
    if (e.touches[0] && scrollContainerRef.current) {
      const x = e.touches[0].pageX - (scrollContainerRef.current.offsetLeft || 0)
      const walk = (x - startX) * 2
      scrollContainerRef.current.scrollLeft = scrollLeft - walk
    }
  }
  
  const handleMouseUp = () => {
    if (!isDragging) return
    
    setIsDragging(false)
    if (scrollContainerRef.current) {
      const { scrollLeft, clientWidth } = scrollContainerRef.current
      const newIndex = Math.round(scrollLeft / clientWidth)
      
      // Ensure index is within bounds
      if (newIndex >= 0 && newIndex < tabs.length) {
        // Snap to the nearest tab with a slight delay to prevent jitter
        setTimeout(() => {
          if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTo({
              left: clientWidth * newIndex,
              behavior: 'smooth'
            })
          }
          
          if (newIndex !== activeTabIndex) {
            setActiveTabIndex(newIndex)
            onChange?.(newIndex)
          }
        }, 50)
      }
    }
  }
  
  const handleTouchEnd = handleMouseUp
  
  // Scroll to active tab on mount or when active tab changes
  useEffect(() => {
    // Only scroll programmatically if we're not in the middle of a user-initiated scroll
    if (scrollContainerRef.current && !isScrolling && !isDragging) {
      const containerWidth = scrollContainerRef.current.clientWidth
      scrollContainerRef.current.scrollTo({
        left: containerWidth * activeTabIndex,
        behavior: 'smooth'
      })
    }
    
    // Update content height when active tab changes
    updateContentHeight();
  }, [activeTabIndex, isScrolling, isDragging, adaptiveHeight]);
  
  // Set up resize observer to update content height when content changes
  useEffect(() => {
    if (!adaptiveHeight) return;
    
    // Clean up previous observer
    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect();
    }
    
    // Create new observer
    resizeObserverRef.current = new ResizeObserver(() => {
      updateContentHeight();
    });
    
    // Observe active tab content
    const activeTabContent = tabContentRefs.current[activeTabIndex];
    if (activeTabContent) {
      const contentElement = activeTabContent.firstElementChild as HTMLElement;
      if (contentElement) {
        resizeObserverRef.current.observe(contentElement);
      }
    }
    
    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
    };
  }, [activeTabIndex, adaptiveHeight]);
  
  // Highlight the active tab indicator
  useEffect(() => {
    // We're now using background highlight instead of a line indicator
    // This effect is kept for potential future enhancements or for window resize handling
    
    window.addEventListener('resize', () => updateContentHeight())
    return () => {
      window.removeEventListener('resize', () => updateContentHeight())
      // Clear any pending timeouts on unmount
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }
    }
  }, [activeTabIndex, tabs])
  
  // Render tab buttons
  const renderTabButtons = () => {
    return tabs.map((tab, index) => (
      <button
        key={tab.id}
        className={cn(
          "flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-colors",
          "focus:outline-none",
          activeTabIndex === index 
            ? "text-zinc-600 dark:text-zinc-300 bg-zinc-300/50 dark:bg-zinc-800/50" 
            : "text-zinc-700 dark:text-zinc-100 hover:text-zinc-600 dark:hover:text-zinc-300",
          tabClassName
        )}
        onClick={() => handleTabClick(index)}
      >
        {tab.icon && <span className="text-base">{tab.icon}</span>}
        <span className="font-light font-display tracking-wide text-[10px] leading-none">{tab.label}</span>
      </button>
    ));
  };
  
  return (
    <div className={cn("flex flex-col overflow-hidden", className)}>
      {/* Tab headers - conditionally rendered at top */}
      {tabPosition === 'top' && (
        <div className="relative">
          <div 
            ref={tabsContainerRef}
            className="frosted-glass rounded-2xl px-3 py-1 flex items-center justify-around shadow-sm"
          >
            {renderTabButtons()}
          </div>
        </div>
      )}
      
      {/* Tab content */}
      <div 
        ref={scrollContainerRef}
        className={cn(
          "flex overflow-x-auto snap-x snap-mandatory scrollbar-hide overflow-y-auto flex-grow",
          contentClassName,
          contentHeight && contentHeight > (scrollContainerRef.current?.clientHeight ?? 0) ? 'overflow-y-auto' : 'overflow-y-hidden',
          !isDragging && !!tabs[activeTabIndex]?.className ? tabs[activeTabIndex]?.className : ''
        )}
        style={{ 
          scrollbarWidth: 'none', 
          msOverflowStyle: 'none',
          height: adaptiveHeight && contentHeight ? `${contentHeight}px` : undefined,
          transition: 'height 0.3s ease',
          scrollBehavior: 'smooth',
        }}
        onScroll={handleScroll}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {tabs.map((tab, index) => (
          <div 
            key={tab.id}
            ref={(el) => {
              tabContentRefs.current[index] = el;
            }}
            className="min-w-full w-full snap-center flex flex-col flex-grow"
          >
            {tab.content}
          </div>
        ))}
      </div>
      
      {/* Tab headers - conditionally rendered at bottom */}
      {tabPosition === 'bottom' && (
        <div className="relative mt-auto">
          <div 
            ref={tabsContainerRef}
            className="frosted-glass rounded-2xl mx-3 mb-1 px-3 py-1 flex items-center justify-around shadow-sm"
          >
            {renderTabButtons()}
          </div>
        </div>
      )}
    </div>
  )
}

// CSS helper for hiding scrollbars
const scrollbarHideStyles = `
  .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }
  
  .scrollbar-hide {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
`

// Add styles to head
if (typeof document !== 'undefined') {
  const style = document.createElement('style')
  style.textContent = scrollbarHideStyles
  document.head.appendChild(style)
} 