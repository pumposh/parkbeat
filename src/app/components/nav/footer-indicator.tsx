import { cn } from "@/lib/utils"
import type { FooterAction } from "./footer"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"

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

  // Use useEffect to calculate dimensions after DOM has loaded
  useEffect(() => {
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
  }, [activeIndex, pathname]);

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