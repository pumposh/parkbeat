'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useWebSocketState } from '@/hooks/websocket-manager';
import { cn } from '@/lib/utils';
import { DebugMenu } from '../debug-menu';
import gsap from 'gsap';
import { Draggable } from 'gsap/Draggable';
import { generateId } from '@/lib/id';
import './floating-debug-control.css';

import { useAdminSettings } from '@/app/state/use-app-settings';
import { usePersistentState } from '@/hooks/use-persistence';

// Register the Draggable plugin
gsap.registerPlugin(Draggable);

// Generate a unique ID for this component instance
const COMPONENT_ID = 'floating-debug-control';

// Physics constants
const EDGE_MAGNETIC_THRESHOLD = 100; // Distance in pixels where edge magnetism starts
const EDGE_MAGNETIC_STRENGTH = 0.8; // Strength of the magnetic pull (0-1)
const VELOCITY_SAMPLES = 5; // Number of samples to track for velocity calculation
const MIN_VELOCITY_THRESHOLD = 20; // Minimum velocity to trigger inertia
const MAX_VELOCITY = 2000; // Maximum velocity cap
const FRICTION = 0.84; // Friction coefficient (0-1)
const FLICK_DURATION_THRESHOLD = 300; // Max duration in ms to consider a motion a "flick"
const FLICK_INTENSITY_FACTOR = 0.7; // Factor to scale down velocity for short flicks
const BOUNCE_OVERSHOOT = 5; // Pixels to overshoot when bouncing
const BOUNCE_DURATION = 0.4; // Duration of bounce animation in seconds

// Edge states for border radius animation
type EdgeState = {
  top: boolean;
  right: boolean;
  bottom: boolean;
  left: boolean;
};

interface VelocitySample {
  x: number;
  y: number;
  time: number;
}

export function FloatingDebugControl() {
  // Get debug control settings from app settings state
  const [debugControlVisible] = useAdminSettings.debugControl();
  const isEnabled = debugControlVisible;
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  const [isDragging, setIsDragging] = useState(false);
  const [edgeState, setEdgeState] = useState<EdgeState>({
    top: true,
    right: false,
    bottom: false,
    left: true,
  });
  const controlRef = useRef<HTMLDivElement>(null);
  const draggableRef = useRef<any>(null);
  const clickTimeRef = useRef<number>(0);
  const windowSize = useRef({ width: 0, height: 0 });
  
  // Physics tracking refs
  const velocitySamples = useRef<VelocitySample[]>([]);
  const [
    lastPosition,
    setLastPosition,
    isInitialized,
  ] = usePersistentState(
    'floating-debug-control-last-position',
    { x: 0, y: 0 },
  );

  const animationFrameId = useRef<number | null>(null);
  const currentVelocity = useRef({ x: 0, y: 0 });
  const isInertiaActive = useRef(false);
  const hasMoved = useRef(false);
  const moveThreshold = 10; // Pixels of movement required to consider it a drag instead of a click
  const dragStartTime = useRef<number>(0);
  const dragDistance = useRef({ x: 0, y: 0 });
  const dragDuration = useRef<number>(0);

  // Get WebSocket state for displaying in the control
  const {
    connectionState,
    activeSubscriptions,
    hookCount
  } = useWebSocketState();

  // Clean up any existing instances on mount and handle cleanup on unmount
  useEffect(() => {
    // Clean up any existing instances with the same class but different ID
    const cleanup = () => {
      const existingControls = document.querySelectorAll('.floating-debug-control');
      existingControls.forEach(control => {
        if (control.id !== COMPONENT_ID) {
          // Remove any GSAP animations/draggables associated with this element
          gsap.killTweensOf(control);
          control.remove();
        }
      });
    };
    
    // Initial cleanup
    cleanup();
    
    // Set up MutationObserver to detect and clean up duplicate instances
    const observer = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          // Check if any floating debug controls were added
          const controls = document.querySelectorAll('.floating-debug-control');
          if (controls.length > 1) {
            cleanup();
          }
        }
      });
    });
    
    // Start observing the document body for added nodes
    observer.observe(document.body, { childList: true, subtree: true });
    
    return () => {
      // Clean up this instance and stop the observer
      observer.disconnect();
      
      // Kill any GSAP animations
      if (controlRef.current) {
        gsap.killTweensOf(controlRef.current);
      }
      
      // Kill draggable
      if (draggableRef.current) {
        draggableRef.current.kill();
        draggableRef.current = null;
      }
      
      // Cancel any animation frames
      if (animationFrameId.current !== null) {
        cancelAnimationFrame(animationFrameId.current);
        animationFrameId.current = null;
      }
    };
  }, []);

  // Update window size on mount and resize
  useEffect(() => {
    const updateWindowSize = () => {
      windowSize.current = {
        width: window.innerWidth - 1,
        height: window.innerHeight - 1
      };
    };
    
    // Initial size
    updateWindowSize();
    
    // Listen for resize events
    window.addEventListener('resize', updateWindowSize);
    return () => window.removeEventListener('resize', updateWindowSize);
  }, []);

  // Calculate corner classes based on edge state
  const getCornerClasses = (edgeState: EdgeState) => {
    const { top, right, bottom, left } = edgeState;
    
    // Determine classes for each corner
    const classes = [];
    
    // Add individual corner classes - only flatten a corner when both adjacent edges are touched
    // Top-left corner
    if (top || left) {
      classes.push('floating-debug-control--corner-tl-flat');
    } else {
      classes.push('floating-debug-control--corner-tl-rounded');
    }
    
    // Top-right corner
    if (top || right) {
      classes.push('floating-debug-control--corner-tr-flat');
    } else {
      classes.push('floating-debug-control--corner-tr-rounded');
    }
    
    // Bottom-right corner
    if (bottom || right) {
      classes.push('floating-debug-control--corner-br-flat');
    } else {
      classes.push('floating-debug-control--corner-br-rounded');
    }
    
    // Bottom-left corner
    if (bottom || left) {
      classes.push('floating-debug-control--corner-bl-flat');
    } else {
      classes.push('floating-debug-control--corner-bl-rounded');
    }
    
    return classes.join(' ');
  };

  const cornerClasses = useMemo(() => getCornerClasses(edgeState), [edgeState]);

  // Update edge state based on position
  const updateEdgeState = (x: number, y: number) => {
    if (!controlRef.current) return;
    
    const rect = controlRef.current.getBoundingClientRect();
    const { width, height } = windowSize.current;
    
    // Define a threshold for edge detection (in pixels)
    const edgeThreshold = 2; // Slightly more forgiving than the current 1px
    
    // Check if the control is at or beyond any edge (can happen during animations)
    const newEdgeState: EdgeState = {
      top: y <= edgeThreshold,
      right: x + rect.width >= width - edgeThreshold,
      bottom: y + rect.height >= height - edgeThreshold,
      left: x <= edgeThreshold
    };
    
    // Only update if there's a change to avoid unnecessary re-renders
    if (
      newEdgeState.top !== edgeState.top ||
      newEdgeState.right !== edgeState.right ||
      newEdgeState.bottom !== edgeState.bottom ||
      newEdgeState.left !== edgeState.left
    ) {
      setEdgeState(newEdgeState);
    }
  };

  // Calculate velocity based on samples and adjust for motion characteristics
  const calculateVelocity = () => {
    const samples = velocitySamples.current;
    if (samples.length < 2) return { x: 0, y: 0 };
    
    const newest = samples[samples.length - 1];
    const oldest = samples[0];
    
    // Safety check for undefined values
    if (!newest || !oldest) return { x: 0, y: 0 };
    
    const timeDiff = newest.time - oldest.time;
    if (timeDiff === 0) return { x: 0, y: 0 };
    
    // Calculate velocity in pixels per second
    const vx = ((newest.x - oldest.x) / timeDiff) * 1000;
    const vy = ((newest.y - oldest.y) / timeDiff) * 1000;
    
    // Calculate total drag duration and distance
    dragDuration.current = performance.now() - dragStartTime.current;
    
    // Adjust velocity based on drag characteristics
    let adjustedVx = vx;
    let adjustedVy = vy;
    
    // For short flicks (quick motions), scale down the velocity
    if (dragDuration.current < FLICK_DURATION_THRESHOLD) {
      // Calculate how much of a "flick" this was (0-1)
      const flickFactor = dragDuration.current / FLICK_DURATION_THRESHOLD;
      
      // For very short flicks, reduce velocity more
      const intensityFactor = FLICK_INTENSITY_FACTOR + (1 - FLICK_INTENSITY_FACTOR) * flickFactor;
      
      // Apply the intensity factor
      adjustedVx *= intensityFactor;
      adjustedVy *= intensityFactor;
    }
    
    // Cap velocity
    const cappedVx = Math.sign(adjustedVx) * Math.min(Math.abs(adjustedVx), MAX_VELOCITY);
    const cappedVy = Math.sign(adjustedVy) * Math.min(Math.abs(adjustedVy), MAX_VELOCITY);
    
    return { x: cappedVx, y: cappedVy };
  };

  // Apply magnetic edge forces to velocity
  const applyMagneticForces = (position: { x: number; y: number }, velocity: { x: number; y: number }) => {
    if (!controlRef.current) return velocity;
    
    const element = controlRef.current;
    const rect = element.getBoundingClientRect();
    const { width, height } = windowSize.current;
    
    // Calculate distances to each edge
    const distToLeft = position.x;
    const distToRight = width - (position.x + rect.width);
    const distToTop = position.y;
    const distToBottom = height - (position.y + rect.height);
    
    // Calculate magnetic forces
    let magneticVx = velocity.x;
    let magneticVy = velocity.y;
    
    // Apply horizontal magnetic forces
    if (distToLeft < EDGE_MAGNETIC_THRESHOLD) {
      // Pull towards left edge
      const pullStrength = 1 - (distToLeft / EDGE_MAGNETIC_THRESHOLD);
      magneticVx = magneticVx * (1 - pullStrength * EDGE_MAGNETIC_STRENGTH) - (pullStrength * EDGE_MAGNETIC_STRENGTH * Math.abs(velocity.x));
    } else if (distToRight < EDGE_MAGNETIC_THRESHOLD) {
      // Pull towards right edge
      const pullStrength = 1 - (distToRight / EDGE_MAGNETIC_THRESHOLD);
      magneticVx = magneticVx * (1 - pullStrength * EDGE_MAGNETIC_STRENGTH) + (pullStrength * EDGE_MAGNETIC_STRENGTH * Math.abs(velocity.x));
    }
    
    // Apply vertical magnetic forces
    if (distToTop < EDGE_MAGNETIC_THRESHOLD) {
      // Pull towards top edge
      const pullStrength = 1 - (distToTop / EDGE_MAGNETIC_THRESHOLD);
      magneticVy = magneticVy * (1 - pullStrength * EDGE_MAGNETIC_STRENGTH) - (pullStrength * EDGE_MAGNETIC_STRENGTH * Math.abs(velocity.y));
    } else if (distToBottom < EDGE_MAGNETIC_THRESHOLD) {
      // Pull towards bottom edge
      const pullStrength = 1 - (distToBottom / EDGE_MAGNETIC_THRESHOLD);
      magneticVy = magneticVy * (1 - pullStrength * EDGE_MAGNETIC_STRENGTH) + (pullStrength * EDGE_MAGNETIC_STRENGTH * Math.abs(velocity.y));
    }
    
    return { x: magneticVx, y: magneticVy };
  };
  
  // Apply inertia after release
  const applyInertia = () => {
    if (!controlRef.current || !isInertiaActive.current) return;
    
    const element = controlRef.current;
    const currentX = gsap.getProperty(element, "x") as number;
    const currentY = gsap.getProperty(element, "y") as number;
    
    // Apply friction
    currentVelocity.current.x *= FRICTION;
    currentVelocity.current.y *= FRICTION;
    
    // Apply magnetic forces
    const magneticVelocity = applyMagneticForces(
      { x: currentX, y: currentY },
      currentVelocity.current
    );
    
    currentVelocity.current = magneticVelocity;
    
    // Calculate new position
    const newX = currentX + currentVelocity.current.x / 60; // 60fps target
    const newY = currentY + currentVelocity.current.y / 60;
    
    // Check bounds
    const { width, height } = windowSize.current;
    const rect = element.getBoundingClientRect();
    
    let boundedX = newX;
    let boundedY = newY;
    let hitBoundary = false;
    
    // Bound horizontally
    if (newX < 0) {
      boundedX = 0;
      currentVelocity.current.x = 0;
      hitBoundary = true;
    } else if ((newX + rect.width) > width) {
      boundedX = width - rect.width;
      currentVelocity.current.x = 0;
      hitBoundary = true;
    }
    
    // Bound vertically
    if (newY < 0) {
      boundedY = 0;
      currentVelocity.current.y = 0;
      hitBoundary = true;
    } else if ((newY + rect.height) > height) {
      boundedY = height - rect.height;
      currentVelocity.current.y = 0;
      hitBoundary = true;
    }
    
    // Update position
    gsap.set(element, { x: boundedX, y: boundedY });
    
    // Update edge state for border radius animation
    updateEdgeState(boundedX, boundedY);
    
    // Stop animation if velocity is very low
    const speed = Math.sqrt(
      currentVelocity.current.x * currentVelocity.current.x + 
      currentVelocity.current.y * currentVelocity.current.y
    );
    
    if (speed < 1) {
      isInertiaActive.current = false;
      
      // If we hit a boundary, apply a bounce effect
      if (hitBoundary) {
        // Determine which edges were hit
        const hitLeft = boundedX === 0;
        const hitRight = boundedX === width - rect.width;
        const hitTop = boundedY === 0;
        const hitBottom = boundedY === height - rect.height;
        
        // Create bounce animation based on which edges were hit
        const timeline = gsap.timeline();
        
        // Calculate overshoot positions
        const overshootX = hitLeft ? -BOUNCE_OVERSHOOT : 
                          hitRight ? boundedX + BOUNCE_OVERSHOOT : 
                          boundedX;
        
        const overshootY = hitTop ? -BOUNCE_OVERSHOOT : 
                          hitBottom ? boundedY + BOUNCE_OVERSHOOT : 
                          boundedY;
        
        // First overshoot slightly
        timeline.to(element, {
          x: overshootX,
          y: overshootY,
          duration: BOUNCE_DURATION * 0.4,
          ease: "power2.out"
        });
        
        // Set edge state immediately for visual feedback during animation
        setEdgeState({
          top: hitTop,
          right: hitRight,
          bottom: hitBottom,
          left: hitLeft,
        });
        
        // Then settle at the final position
        timeline.to(element, {
          x: boundedX,
          y: boundedY,
          duration: BOUNCE_DURATION * 0.6,
          ease: "elastic.out(1, 0.5)",
          onComplete: () => {
            // Update edge state after animation completes
            updateEdgeState(boundedX, boundedY);
            if (isInitialized) {
              // Persist final position
              setLastPosition({ x: boundedX, y: boundedY });
            }
          }
        });
      }
      
      if (animationFrameId.current !== null) {
        cancelAnimationFrame(animationFrameId.current);
        animationFrameId.current = null;
      }
      return;
    }
    
    // Continue animation
    animationFrameId.current = requestAnimationFrame(applyInertia);
  };

  // Initialize GSAP Draggable
  useEffect(() => {
    if (!controlRef.current) return;
    if (!isInitialized) return;

    let coords = { x: 0, y: 0 };
    
    // Check if we have a saved position from previous sessions
    if (lastPosition.x !== 0 || lastPosition.y !== 0) {
      coords = { x: lastPosition.x || 0, y: lastPosition.y || 0 };
    } else {
      // Set initial position to horizontal center and 12px from top
      const controlWidth = controlRef.current.offsetWidth;
      const windowWidth = windowSize.current.width;
      coords = { 
        x: (windowWidth / 2) - (controlWidth / 2), 
        y: 12 
      };
    }

    setLastPosition(coords);
    updateEdgeState(coords.x, coords.y);

    // Set the initial position using GSAP
    gsap.set(controlRef.current, { x: coords.x, y: coords.y });

    // Kill any existing draggable instance
    if (draggableRef.current) {
      draggableRef.current.kill();
      draggableRef.current = null;
    }

    // Create the draggable instance
    draggableRef.current = Draggable.create(controlRef.current, {
      type: 'x,y',
      edgeResistance: 0.65,
      bounds: {
        minX: -BOUNCE_OVERSHOOT,
        minY: -BOUNCE_OVERSHOOT,
        maxX: windowSize.current.width - (controlRef.current.offsetWidth - BOUNCE_OVERSHOOT),
        maxY: windowSize.current.height - (controlRef.current.offsetHeight - BOUNCE_OVERSHOOT)
      },
      inertia: false, // We'll handle our own inertia
      dragClickables: true,
      dragResistance: 0,
      cursor: 'grab',
      activeCursor: 'grabbing',
      onPress: function() {
        // Stop any ongoing inertia animation
        isInertiaActive.current = false;
        if (animationFrameId.current !== null) {
          cancelAnimationFrame(animationFrameId.current);
          animationFrameId.current = null;
        }
        
        // Clear velocity samples
        velocitySamples.current = [];
        
        // Reset movement tracking
        hasMoved.current = false;
        
        // Reset drag metrics
        dragStartTime.current = performance.now();
        dragDistance.current = { x: 0, y: 0 };
        
        // Prevent any transitions from interfering with dragging
        gsap.set(this.target, { clearProps: "transition" });
        
        // Record initial position
        if (isInitialized) {
          setLastPosition({
            x: gsap.getProperty(this.target, "x") as number,
            y: gsap.getProperty(this.target, "y") as number
          });
        }
        
        // Record click time for tap detection
        clickTimeRef.current = Date.now();
      },
      onDragStart: () => {
        setIsDragging(true);
        
        // Disable transitions during drag for smoother cursor following
        if (controlRef.current) {
          controlRef.current.style.transition = 'none';
        }
      },
      onDrag: function() {
        // Ensure no transitions are applied during drag
        if (controlRef.current && controlRef.current.style.transition) {
          controlRef.current.style.transition = 'none';
        }
        
        // Record position and time for velocity calculation
        const currentX = gsap.getProperty(this.target, "x") as number;
        const currentY = gsap.getProperty(this.target, "y") as number;
        const currentTime = performance.now();
        
        // Update edge state for border radius animation
        updateEdgeState(currentX, currentY);
        
        // Update total drag distance
        dragDistance.current.x += Math.abs(currentX - lastPosition.x);
        dragDistance.current.y += Math.abs(currentY - lastPosition.y);
        
        // Check if we've moved enough to consider this a drag operation
        const dx = currentX - lastPosition.x;
        const dy = currentY - lastPosition.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > moveThreshold) {
          hasMoved.current = true;
        }
        
        // Add sample to array, keeping only the last VELOCITY_SAMPLES samples
        velocitySamples.current.push({
          x: currentX,
          y: currentY,
          time: currentTime
        });
        
        if (velocitySamples.current.length > VELOCITY_SAMPLES) {
          velocitySamples.current.shift();
        }
        
        // Update last position
        if (isInitialized) {
          setLastPosition({ x: currentX, y: currentY });
        }
      },
      onRelease: function() {
        // If it was a quick tap/click and we didn't move much, toggle the dialog
        if (Date.now() - clickTimeRef.current < 200 && !hasMoved.current) {
          setIsDialogOpen(!isDialogOpen);
          setIsDragging(false);
          return;
        }
      },
      onDragEnd: function() {
        // If it was a quick tap/click and we didn't move much, toggle the dialog
        if (Date.now() - clickTimeRef.current < 200 && !hasMoved.current) {
          setIsDialogOpen(!isDialogOpen);
          setIsDragging(false);
          return;
        }

        // Calculate final velocity with adjustments for motion characteristics
        currentVelocity.current = calculateVelocity();
        
        // Only apply inertia if velocity is above threshold
        const speed = Math.sqrt(
          currentVelocity.current.x * currentVelocity.current.x + 
          currentVelocity.current.y * currentVelocity.current.y
        );
        
        if (speed > MIN_VELOCITY_THRESHOLD) {
          // Start inertia animation
          isInertiaActive.current = true;
          animationFrameId.current = requestAnimationFrame(applyInertia);
        } else {
          // Check if we're at a boundary
          const element = this.target;
          const rect = element.getBoundingClientRect();
          const { width, height } = windowSize.current;
          
          const currentX = gsap.getProperty(element, "x") as number;
          const currentY = gsap.getProperty(element, "y") as number;
          
          const atLeftEdge = currentX <= 0;
          const atRightEdge = currentX + rect.width >= width;
          const atTopEdge = currentY <= 0;
          const atBottomEdge = currentY + rect.height >= height;
          
          // Only apply bounce if we're at an edge
          if (atLeftEdge || atRightEdge || atTopEdge || atBottomEdge) {
            // Calculate final position (at the edge)
            const finalX = atLeftEdge ? 0 : atRightEdge ? width - rect.width : currentX;
            const finalY = atTopEdge ? 0 : atBottomEdge ? height - rect.height : currentY;
            
            // Calculate overshoot positions
            const overshootX = atLeftEdge ? -BOUNCE_OVERSHOOT : 
                              atRightEdge ? finalX + BOUNCE_OVERSHOOT : 
                              finalX;
            
            const overshootY = atTopEdge ? -BOUNCE_OVERSHOOT : 
                              atBottomEdge ? finalY + BOUNCE_OVERSHOOT : 
                              finalY;
            
            // Create bounce animation
            const timeline = gsap.timeline();
            
            // First overshoot slightly
            timeline.to(element, {
              x: overshootX,
              y: overshootY,
              duration: BOUNCE_DURATION * 0.4,
              ease: "power2.out"
            });

            setEdgeState({
              top: atTopEdge,
              right: atRightEdge,
              bottom: atBottomEdge,
              left: atLeftEdge,
            });
            
            // Then settle at the final position
            timeline.to(element, {
              x: finalX,
              y: finalY,
              duration: BOUNCE_DURATION * 0.6,
              ease: "elastic.out(1, 0.5)",
              onComplete: () => {
                // Update edge state after animation completes
                updateEdgeState(finalX, finalY);
                // Persist final position
                setLastPosition({ x: finalX, y: finalY });
              }
            });
          } else {
            // Just update the edge state if we're not at an edge
            updateEdgeState(currentX, currentY);
            // Persist position
            setLastPosition({ x: currentX, y: currentY });
          }
        }
        
        setIsDragging(false);
      }
    })[0];

    // Clean up
    return () => {
      if (draggableRef.current) {
        draggableRef.current.kill();
        draggableRef.current = null;
      }
      
      if (animationFrameId.current !== null) {
        cancelAnimationFrame(animationFrameId.current);
        animationFrameId.current = null;
      }
    };
  }, [isDialogOpen, isInitialized]);

  // Handle direct click on the control
  const handleClick = () => {
    if (!hasMoved.current) {
      setIsDialogOpen(true);
    }
  };

  // Get connection status color
  const getConnectionStatusColor = () => {
    switch (connectionState) {
      case 'connected':
        return 'bg-emerald-500';
      case 'disconnected':
        return 'bg-red-500';
      default:
        return 'bg-amber-500';
    }
  };

  return (
    <>
      {/* Floating Debug Control */}
      <div
        id={COMPONENT_ID}
        ref={controlRef}
        onClick={handleClick}
        className={`${cornerClasses} ${cn(
          "frosted-glass-bg-base floating-debug-control fixed z-[9999] flex items-center gap-2 px-3 py-1.5",
          isEnabled ? '' : 'floating-debug-control--disabled',
          "shadow-[0_8px_30px_rgb(0,0,0,0.28)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.24)]",
          "select-none cursor-pointer",
          isDragging && "scale-105"
        )}`}
        style={{
          position: 'absolute',
          top: '0',
          left: '0',
          transform: 'translateX(0)',
          touchAction: 'none',
          pointerEvents: isEnabled ? 'auto' : 'none', // Control pointer events based on enabled state
          zIndex: 10000, // Use a very high z-index to ensure it's above portals
          transition: 'border-radius 0.2s ease-in-out, opacity 0.3s ease-in-out',
          opacity: isEnabled ? 1 : 0, // Control visibility with opacity
        }}
      >
        {/* Connection status indicator */}
        <div className={cn(
          "w-2 h-2 rounded-full",
          getConnectionStatusColor()
        )} />
        
        {/* Hook count */}
        <div className="flex items-center gap-1 text-xs text-zinc-800 dark:text-white">
          <i className="fa-solid fa-plug text-zinc-500 dark:text-zinc-400" aria-hidden="true" />
          <span>{hookCount}</span>
        </div>
        
        {/* Subscription count */}
        <div className="flex items-center gap-1 text-xs text-zinc-800 dark:text-white">
          <i className="fa-solid fa-satellite-dish text-zinc-500 dark:text-zinc-400" aria-hidden="true" />
          <span>{activeSubscriptions.length}</span>
        </div>
      </div>
      
      {/* Debug Menu */}
      <DebugMenu 
        isOpen={isDialogOpen} 
        onOpenChange={setIsDialogOpen}
        additionalTabs={[]}
      />
    </>
  );
} 