'use client'

import { useState, useRef, useEffect, ReactNode } from 'react'
import { cn } from '@/lib/utils'

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

interface SwipeableTabsProps {
  tabs: Tab[]
  className?: string
  tabClassName?: string
  contentClassName?: string
  onChange?: (index: number) => void
  currentTabIndex?: number
  adaptiveHeight?: boolean
  tabPosition?: 'top' | 'bottom' | 'none'
}

export function SwipeableTabs({
  tabs,
  className,
  tabClassName,
  contentClassName,
  onChange,
  currentTabIndex = 0,
  adaptiveHeight = true,
  tabPosition = 'top',
}: SwipeableTabsProps) {
  const [activeTabIndex, _setActiveTabIndex] = useState(currentTabIndex)
  const [isScrolling, setIsScrolling] = useState(false)
  const [contentHeightByTab, setContentHeightByTab] = useState<Record<number, number | null>>({})
  const [interpolatedHeight, setInterpolatedHeight] = useState<number | null>(null)
  const [initialHeightsLoaded, setInitialHeightsLoaded] = useState(false)
  const [allTabsPreloaded, setAllTabsPreloaded] = useState(false)
  const [isProgrammaticScroll, setIsProgrammaticScroll] = useState(false)
  const [translateX, setTranslateX] = useState(0)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const tabsContainerRef = useRef<HTMLDivElement>(null)
  const tabContentRefs = useRef<(HTMLDivElement | null)[]>(tabs.map(() => null))
  const tabContentElementRefs = useRef<(HTMLElement | null)[]>(tabs.map(() => null))
  const preloadContainerRef = useRef<HTMLDivElement>(null)
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const [scrollPositionByTab, setScrollPositionByTab] = useState<Record<number, 'middle' | 'top' | 'bottom'>>({})
  const [hasScrollableContentByTab, setHasScrollableContentByTab] = useState<Record<number, boolean>>({})
  const [displayFooter, setDisplayFooter] = useState(false)
  const pendingScrollRef = useRef<number | null>(null)

  // Initialize all tabs as rendered for preloading
  const [hasRendered, setHasRendered] = useState<boolean[]>(tabs.map(() => true))
  
  const setActiveTabIndex = (index: number) => {
    _setActiveTabIndex(index)
    setHasRendered(prev => {
      const newHasRendered = [...prev]
      newHasRendered[index] = true
      return newHasRendered
    })
  }

  // Proxy function to handle all tab change requests
  const changeTab = (index: number, source: 'parent' | 'button' | 'scroll') => {
    // Only update if the index is valid
    if (index < 0 || index >= tabs.length) {
      return;
    }
    
    // If the change is from scrolling, just update the active tab
    if (source === 'scroll') {
      setActiveTabIndex(index);
      onChange?.(index);
      return;
    }
    
    // For parent or button changes, update the scroll position
    if (scrollContainerRef.current) {
      const containerWidth = scrollContainerRef.current.clientWidth;
      
      // Set flag to indicate this is a programmatic scroll
      setIsProgrammaticScroll(true);
      
      // Store the target index for when scrolling completes
      pendingScrollRef.current = index;
      
      const { scrollLeft } = scrollContainerRef.current
      const targetScrollLeft = containerWidth * index
      const dx = targetScrollLeft - scrollLeft
      setTranslateX(-dx)

      const targetHeight = Math.min(
        contentHeightByTab[index] ?? 0,
        scrollContainerRef.current?.clientHeight ?? 0
      )
      setInterpolatedHeight(targetHeight)
      
      // Set a timeout to handle the case where the scroll event might not fire
      setTimeout(() => {
        if (pendingScrollRef.current === index) {
          setIsProgrammaticScroll(false);
          pendingScrollRef.current = null;
          setActiveTabIndex(index);
          onChange?.(index);
          setTranslateX(0)

          const targetEl = tabsContainerRef.current?.children[index]
          if (targetEl) {
            targetEl.scrollIntoView({ behavior: 'instant' })
          } else {
            scrollContainerRef.current?.scrollTo({
              left: targetScrollLeft,
              behavior: 'instant'
            })
          }
        }
      }, 300); // Slightly longer than the scroll animation
    } else {
      // If scroll container isn't available, just update the active tab
      setActiveTabIndex(index);
      onChange?.(index);
    }
  };

  // Handle parent updates to currentTabIndex
  useEffect(() => {
    if (currentTabIndex !== activeTabIndex) {
      changeTab(currentTabIndex, 'parent');
    }
  }, [currentTabIndex]);
  
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
  };

  // Handle tab click
  const handleTabClick = (index: number) => {
    changeTab(index, 'button');
  }
  
  // Handle scroll events to update active tab based on scroll position
  const handleScroll = () => {
    if (scrollContainerRef.current) {
      // Set scrolling state to true if not programmatic
      if (!isProgrammaticScroll) {
        setIsScrolling(true)
      }
      
      // Calculate the current scroll progress and interpolate height
      // regardless of scroll source
      if (adaptiveHeight) {
        const { scrollLeft, clientWidth } = scrollContainerRef.current
        // Avoid division by zero
        if (clientWidth === 0) {
          return
        }
        
        // Calculate which tabs we're between and the progress
        const rawProgress = scrollLeft / clientWidth
        
        // Find the indices of the tabs we're between
        const tabCount = tabs.length
        let leftIndex = -1
        let rightIndex = -1
        let progress = 0
        
        // Find the two tabs we're between
        for (let i = 0; i < tabCount - 1; i++) {
          const leftBound = i
          const rightBound = i + 1
          
          if (rawProgress >= leftBound && rawProgress <= rightBound) {
            leftIndex = i
            rightIndex = i + 1
            progress = rawProgress - leftBound
            break
          }
        }
        
        // Handle edge cases
        if (leftIndex === -1) {
          if (rawProgress < 0) {
            leftIndex = 0
            rightIndex = 0
            progress = 0
          } else {
            leftIndex = tabCount - 1
            rightIndex = tabCount - 1
            progress = 0
          }
        }
        
        // Get heights for the tabs we're between

        const leftHeight = contentHeightByTab[leftIndex] ?? null
        const rightHeight = contentHeightByTab[rightIndex] ?? null
        
        // Only interpolate if both heights are available
        if (leftHeight !== null && rightHeight !== null && leftHeight > 0 && rightHeight > 0) {
          // Linear interpolation between the two heights
          const newHeight = leftHeight + (rightHeight - leftHeight) * progress
          setInterpolatedHeight(newHeight)
        } else {
          // Use available height if only one is available
          if (leftHeight !== null && leftHeight > 0) {
            setInterpolatedHeight(leftHeight)
          } else if (rightHeight !== null && rightHeight > 0) {
            setInterpolatedHeight(rightHeight)
          }
        }
      }
    

      // Clear any existing timeout
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }
      
      // Set a timeout to handle the end of scrolling
      scrollTimeoutRef.current = setTimeout(() => {
        if (scrollContainerRef.current) {
          const { scrollLeft, clientWidth } = scrollContainerRef.current
          const newIndex = Math.round(scrollLeft / clientWidth)
          
          if (newIndex !== activeTabIndex && newIndex >= 0 && newIndex < tabs.length) {
            changeTab(newIndex, 'scroll')
          }
        }
        setIsScrolling(false)
        setIsProgrammaticScroll(false)
        setInterpolatedHeight(null)
      }, 150)
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
    if (scrollContainerRef.current && !isScrolling && !isProgrammaticScroll) {
      const containerWidth = scrollContainerRef.current.clientWidth

      const targetEl = tabsContainerRef.current?.children[activeTabIndex]

      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth' })
      } else {
        scrollContainerRef.current.scrollTo({
        left: containerWidth * activeTabIndex,
          behavior: 'smooth'
        })
      }
    }
    
    // Reset scroll position state when tab changes
    setScrollPositionByTab(prev => ({ ...prev, [activeTabIndex]: 'middle' }))
  }, [activeTabIndex, isScrolling, isProgrammaticScroll]);

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
  
  // Preload all tab heights
  useEffect(() => {
    if (!adaptiveHeight || allTabsPreloaded) return;

    // Check if we have heights for all tabs
    const allHeightsLoaded = tabs.every((_, index) => 
      contentHeightByTab[index] !== undefined && contentHeightByTab[index] !== null
    );

    if (allHeightsLoaded) {
      setAllTabsPreloaded(true);
    }
  }, [contentHeightByTab, tabs.length, adaptiveHeight, allTabsPreloaded]);
  
  // Set up a single resize observer to watch all tab content elements
  useEffect(() => {
    if (!adaptiveHeight) return;
    
    // Clean up previous observer
    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect();
    }
    
    // Create a single observer for all tabs
    resizeObserverRef.current = new ResizeObserver((entries) => {
      let updatedHeights = false;
      
      entries.forEach(entry => {
        // Find which tab this entry corresponds to
        const tabIndex = tabContentElementRefs.current.findIndex(el => el === entry.target);
        if (tabIndex !== -1) {
          // Update height for this specific tab
          const height = entry.target.scrollHeight;
          
          // Only update if height is valid
          if (height > 0) {
            setContentHeightByTab(prev => {
              updatedHeights = true;
              return { ...prev, [tabIndex]: height };
            });
          }
          
          // Check if content is scrollable
          const isScrollable = entry.target.scrollHeight > entry.target.clientHeight;
          setHasScrollableContentByTab(prev => ({ ...prev, [tabIndex]: isScrollable }));
          
          // If content is scrollable, check initial scroll position
          if (isScrollable) {
            checkScrollPosition(entry.target as HTMLElement, tabIndex);
          }
        }
      });
      
      // Mark initial heights as loaded if we've updated heights
      if (updatedHeights && !initialHeightsLoaded) {
        setInitialHeightsLoaded(true);
      }
    });
    
    // Observe all rendered tab content elements
    tabContentRefs.current.forEach((ref, index) => {
      if (ref && hasRendered[index]) {
        const contentElement = ref.firstElementChild as HTMLElement;
        if (contentElement) {
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
  }, [adaptiveHeight, tabContentRefs]);
  
  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      // No need to call updateContentHeight as the ResizeObserver will handle this
      // Just ensure the scroll position is correct
      if (scrollContainerRef.current && !isScrolling) {
        const containerWidth = scrollContainerRef.current.clientWidth
        const targetEl = tabsContainerRef.current?.children[activeTabIndex]
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth' })
        } else {
          scrollContainerRef.current.scrollTo({
            left: containerWidth * activeTabIndex,
            behavior: 'smooth'
          })
        }
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
    if (tabPosition === 'none') return null;
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
      {/* Hidden container to preload all tab contents for height measurement */}
      {/* {!allTabsPreloaded && adaptiveHeight && (
        <div 
          ref={preloadContainerRef}
          className="absolute opacity-0 pointer-events-none overflow-hidden"
          style={{ height: 0, width: '100%' }}
        >
          {tabs.map((tab, index) => (
            <div key={`preload-${tab.id}`} className="w-full">
              <div 
                ref={(el) => {
                  if (el && !tabContentElementRefs.current[index]) {
                    const contentElement = el.firstElementChild as HTMLElement;
                    if (contentElement) {
                      tabContentElementRefs.current[index] = contentElement;
                      
                      // Measure height
                      const height = contentElement.scrollHeight;
                      if (height > 0 && contentHeightByTab[index] === undefined) {
                        setContentHeightByTab(prev => ({ ...prev, [index]: height }));
                      }
                    }
                  }
                }}
              >
                {tab.content}
              </div>
            </div>
          ))}
        </div>
      )} */}

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
          isProgrammaticScroll ? 'overflow-x-visible' : 'overflow-x-auto',
          contentClassName,
          contentHeightByTab[activeTabIndex] && contentHeightByTab[activeTabIndex] > (scrollContainerRef.current?.clientHeight ?? 0) ? 'overflow-y-auto' : 'overflow-y-hidden',
          !!tabs[activeTabIndex]?.className ? tabs[activeTabIndex]?.className : ''
        )}
        style={{
          scrollbarWidth: 'none', 
          msOverflowStyle: 'none',
          height: adaptiveHeight 
            ? (isScrolling || isProgrammaticScroll) && interpolatedHeight !== null
              ? `${interpolatedHeight}px` 
              : contentHeightByTab[activeTabIndex] !== undefined && contentHeightByTab[activeTabIndex] !== null
                ? `${contentHeightByTab[activeTabIndex]}px` 
                : initialHeightsLoaded ? '0px' : '0px'
              : '0px',
          transition: isScrolling ? 'none' : 'height 0.3s ease',
          scrollBehavior: 'smooth',
        }}
        onScroll={handleScroll}
      >
        {tabs.map((tab, index) => (
          <div 
            key={tab.id}
            className={cn(
              "min-w-full w-full snap-center",
              "flex flex-col flex-grow",
              "animate-fadeIn overflow-hidden",
            )}
          >
            <div 
              className={cn(
                'overflow-y-auto scrollbar-hide',
                hasScrollableContentByTab[index] && 'scrollable-content-mask',
                hasScrollableContentByTab[index] && scrollPositionByTab[index] === 'top'
                  && 'scrollable-content-mask--at-top',
                hasScrollableContentByTab[index] && scrollPositionByTab[index] === 'bottom'
                  && 'scrollable-content-mask--at-bottom'
              )} 
              ref={(el) => {
                tabContentRefs.current[index] = el;
              }}
              onScroll={(e) => handleContentScroll(e, index)}
            >
              {tab.content}
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