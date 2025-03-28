import { cn } from "@/lib/utils"
import type { FooterAction } from "./footer"
import { usePathname } from "next/navigation"
import { useEffect, useState, useCallback } from "react"

export default function FooterIndicator({
  visibleActions, 
}: { 
  visibleActions: FooterAction[], 
}) {
  const pathname = usePathname();
  const [dimensions, setDimensions] = useState({ left: 0, width: 0 });

  // Find active index
  const activeIndex = visibleActions.findIndex(
    (action) => action.href && pathname.includes(action.href)
  );

  // Function to calculate and update dimensions
  const updateDimensions = useCallback(() => {
    if (activeIndex === -1) return;
    
    // Calculate position based on the DOM elements instead of percentages
    const navElement = document.querySelector('nav');
    if (!navElement) return;
    
    const navItems = Array.from(navElement.querySelectorAll('a, div[role="button"]'));
    if (navItems.length === 0 || !navItems[activeIndex]) return;
    
    const activeItem = navItems[activeIndex];
    const navRect = navElement.getBoundingClientRect();
    const itemRect = activeItem.getBoundingClientRect();
    
    // Calculate left and width relative to the nav
    const left = itemRect.left - navRect.left;
    
    setDimensions({
      left,
      width: itemRect.width
    });
  }, [activeIndex]);

  // Use useEffect to set up both initial calculation and resize observation
  useEffect(() => {
    // Initial calculation
    updateDimensions();
    
    // Skip observer setup if no active item
    if (activeIndex === -1) return;
    
    // Find the nav element to observe
    const navElement = document.querySelector('nav');
    if (!navElement) return;
    
    // Create resize observer
    const resizeObserver = new ResizeObserver(() => {
      window.requestAnimationFrame(() => {
        updateDimensions();
      });
    });
    
    // Observe both nav element and window for any size changes
    resizeObserver.observe(navElement);
    window.addEventListener('resize', updateDimensions);
    
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateDimensions);
    };
  }, [activeIndex, updateDimensions, pathname]);

  if (activeIndex === -1) return null;

  return (
    <div 
      className={cn(
        "absolute h-[85%] rounded-lg transition-all duration-300 ease-in-out",
        "backdrop-brightness-150",
        "border border-white/40 dark:border-white/10",
        "shadow-md z-20",
        "top-1/2"
      )}
      style={{
        width: dimensions.width ? `${dimensions.width}px` : `${100 / visibleActions.length}%`,
        left: dimensions.left ? `${dimensions.left}px` : `${activeIndex * (100 / visibleActions.length)}%`,
        transform: 'translateY(-50%)',
      }}
      aria-hidden="true"
    />
  )
}