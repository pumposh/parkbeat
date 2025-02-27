'use client'

import { useState, useRef, useEffect, ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface Tab {
  id: string
  label: string
  content: ReactNode
  skeleton?: ReactNode
  icon?: string | ReactNode
  className?: string
  footerExtension?: ReactNode
  footerExtensionClassName?: string
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
  const [activeTabIndex, _setActiveTabIndex] = useState(defaultTabIndex)
  const [isScrolling, setIsScrolling] = useState(false)
  const [contentHeightByTab, setContentHeightByTab] = useState<Record<number, number | null>>({})
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const tabsContainerRef = useRef<HTMLDivElement>(null)
  const tabContentRefs = useRef<(HTMLDivElement | null)[]>(tabs.map(() => null))
  const tabContentElementRefs = useRef<(HTMLElement | null)[]>(tabs.map(() => null))
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const [scrollPositionByTab, setScrollPositionByTab] = useState<Record<number, 'middle' | 'top' | 'bottom'>>({})
  const [hasScrollableContentByTab, setHasScrollableContentByTab] = useState<Record<number, boolean>>({})
  const [displayFooter, setDisplayFooter] = useState(false)

  const [hasRendered, setHasRendered] = useState<boolean[]>(tabs.map((_, index) => index === defaultTabIndex))
  const setActiveTabIndex = (index: number) => {
    _setActiveTabIndex(index)
    setHasRendered(prev => {
      const newHasRendered = [...prev]
      newHasRendered[index] = true
      return newHasRendered
    })
  }
  
  // Check scroll position to apply appropriate mask
  const checkScrollPosition = (element: HTMLElement, tabIndex: number) => {
    if (!element) return;
    
    const { scrollTop, scrollHeight, clientHeight } = element;
    const isAtTop = scrollTop <= 3;
    const isAtBottom = scrollTop + clientHeight >= scrollHeight - 3;
    if (isAtTop) {
      setScrollPositionByTab(prev => ({ ...prev, [tabIndex]: 'top' }))
    } else if (isAtBottom) {
      setScrollPositionByTab(prev => ({ ...prev, [tabIndex]: 'bottom' }))
    } else {
      setScrollPositionByTab(prev => ({ ...prev, [tabIndex]: 'middle' }))
    }

    const isScrollable = scrollHeight > clientHeight;
    if (isScrollable !== hasScrollableContentByTab[tabIndex]) {
      setHasScrollableContentByTab(prev => ({ ...prev, [tabIndex]: isScrollable }));
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
    }, 1000)
  }
  
  // Handle scroll events to update active tab based on scroll position
  const handleScroll = () => {
    if (scrollContainerRef.current) {
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
  
  // Handle vertical scroll in tab content
  const handleContentScroll = (e: React.UIEvent<HTMLElement>, tabIndex: number) => {
    const target = e.currentTarget;
    checkScrollPosition(target, tabIndex);
  };
  
  // Scroll to active tab on mount or when active tab changes
  useEffect(() => {
    // Only scroll programmatically if we're not in the middle of a user-initiated scroll
    if (scrollContainerRef.current && !isScrolling) {
      const containerWidth = scrollContainerRef.current.clientWidth
      scrollContainerRef.current.scrollTo({
        left: containerWidth * activeTabIndex,
        behavior: 'smooth'
      })
    }
    
    // Reset scroll position state when tab changes
    setScrollPositionByTab(prev => ({ ...prev, [activeTabIndex]: 'middle' }))
  }, [activeTabIndex, isScrolling]);

  const [footerExtension, setFooterExtension] = useState<ReactNode | null>(null)

  useEffect(() => {
    if (tabs[activeTabIndex]?.footerExtension) {
      setFooterExtension(tabs[activeTabIndex].footerExtension)
      setTimeout(() => {
        setDisplayFooter(true)
      }, 300)
    } else {
      setDisplayFooter(false)
      setTimeout(() => {
        setFooterExtension(null)
      }, 300)
    }
  }, [activeTabIndex])
  
  // Set up a single resize observer to watch all tab content elements
  useEffect(() => {
    if (!adaptiveHeight) return;
    
    // Clean up previous observer
    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect();
    }
    
    // Create a single observer for all tabs
    resizeObserverRef.current = new ResizeObserver((entries) => {
      entries.forEach(entry => {
        // Find which tab this entry corresponds to
        const tabIndex = tabContentElementRefs.current.findIndex(el => el === entry.target);
        if (tabIndex !== -1) {
          // Update height for this specific tab
          const height = entry.target.scrollHeight;
          setContentHeightByTab(prev => ({ ...prev, [tabIndex]: height }));
          
          // Check if content is scrollable
          const isScrollable = entry.target.scrollHeight > entry.target.clientHeight;
          setHasScrollableContentByTab(prev => ({ ...prev, [tabIndex]: isScrollable }));
          
          // If content is scrollable, check initial scroll position
          if (isScrollable) {
            checkScrollPosition(entry.target as HTMLElement, tabIndex);
          }
        }
      });
    });
    
    // Observe all rendered tab content elements
    tabContentRefs.current.forEach((ref, index) => {
      if (ref && hasRendered[index]) {
        const contentElement = ref.firstElementChild as HTMLElement;
        if (contentElement) {
          const isScrollable = contentElement.scrollHeight > contentElement.clientHeight;
          if (isScrollable !== hasScrollableContentByTab[index]) {
            setHasScrollableContentByTab(prev => ({ ...prev, [index]: isScrollable }));
          }

          // Store reference to the content element
          tabContentElementRefs.current[index] = contentElement;
          
          // Observe this element
          resizeObserverRef.current?.observe(contentElement);

          // Set up scroll event listeners
          contentElement.addEventListener('scroll', (e) => 
            handleContentScroll(e as unknown as React.UIEvent<HTMLElement>, index)
          );
        }
      }
    });
    
    // Clean up function
    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
      
      // Remove all scroll event listeners
      tabContentElementRefs.current.forEach((el, index) => {
        if (el) {
          el.removeEventListener('scroll', (e) => 
            handleContentScroll(e as unknown as React.UIEvent<HTMLElement>, index)
          );
        }
      });
    };
  }, [adaptiveHeight, hasRendered]);
  
  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      // No need to call updateContentHeight as the ResizeObserver will handle this
      // Just ensure the scroll position is correct
      if (scrollContainerRef.current && !isScrolling) {
        const containerWidth = scrollContainerRef.current.clientWidth
        scrollContainerRef.current.scrollTo({
          left: containerWidth * activeTabIndex,
          behavior: 'smooth'
        })
      }
    };
    
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      // Clear any pending timeouts on unmount
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [activeTabIndex, isScrolling]);
  
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
    <div className={cn("flex flex-col overflow-hidden relative", className)}>
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
          "flex overflow-x-auto snap-x snap-mandatory scrollbar-hide overflow-y-hidden flex-grow",
          contentClassName,
          contentHeightByTab[activeTabIndex] && contentHeightByTab[activeTabIndex] > (scrollContainerRef.current?.clientHeight ?? 0) ? 'overflow-y-auto' : 'overflow-y-hidden',
          !!tabs[activeTabIndex]?.className ? tabs[activeTabIndex]?.className : ''
        )}
        style={{ 
          scrollbarWidth: 'none', 
          msOverflowStyle: 'none',
          height: adaptiveHeight && contentHeightByTab[activeTabIndex] ? `${contentHeightByTab[activeTabIndex]}px` : '0px',
          transition: 'height 0.3s ease',
          scrollBehavior: 'smooth',
        }}
        onScroll={handleScroll}
      >
        {tabs.map((tab, index) => (
          <div 
            key={tab.id}
            className="min-w-full w-full snap-center flex flex-col flex-grow animate-fadeIn overflow-hidden"
          >
            <div 
              className={cn(
                'overflow-y-auto scrollbar-hide',
                hasScrollableContentByTab[index] && 'scrollable-content-mask',
                hasScrollableContentByTab[index] && scrollPositionByTab[index] === 'top' && 'scrollable-content-mask--at-top',
                hasScrollableContentByTab[index] && scrollPositionByTab[index] === 'bottom' && 'scrollable-content-mask--at-bottom'
              )}
              ref={(el) => {
                tabContentRefs.current[index] = el;
              }}
              onScroll={(e) => handleContentScroll(e, index)}
            >
              {index === activeTabIndex
                || hasRendered[index]
                ? tab.content : tab.skeleton}
            </div>
          </div>
        ))}
      </div>
      
      {/* Tab headers - conditionally rendered at bottom */}
      {tabPosition === 'bottom' && (
        <div className="relative mt-auto max-w-full">
          {footerExtension && (
            <div className={cn(
              "absolute transition-all w-[calc(100%-1.5rem)] duration-300 rounded-2xl mx-3 mb-2 py-1 flex items-center justify-around shadow-sm",
              displayFooter
                ? 'bottom-[calc(100%)] blur-none opacity-100'
                : 'bottom-0 blur-md opacity-0',
              tabs[activeTabIndex]?.footerExtensionClassName
            )}>
              {footerExtension}
            </div>
          )}
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