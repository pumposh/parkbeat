'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { getLogger } from '@/lib/logger';
import { asyncTimeout } from '@/lib/async';
import { DedupeThing } from '@/lib/promise';
import { generateId } from '@/lib/id';

// Reusable gradient classes that can be used across components
export const gradients = {
  primary: 'bg-gradient-to-b from-emerald-600/70 to-teal-400/70',
  secondary: 'bg-gradient-to-b from-zinc-300/50 to-zinc-400/10 dark:from-zinc-700/50 dark:to-zinc-800',
  thumb: 'bg-gradient-to-b from-zinc-50 to-zinc-100 dark:from-zinc-50 dark:to-zinc-100',
};

export interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'checked'> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  scaleFactor?: number;
  /**
   * Custom gradient for the checked state
   * @example gradientClass="bg-gradient-to-b from-blue-600/70 to-indigo-400/70"
   */
  gradientClass?: string;
}

export const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, checked, onCheckedChange, scaleFactor = 5, gradientClass, ...props }, ref) => {
    const [checkboxProxy, _setCheckboxProxy] = useState(checked);
    const [isAnimating, setIsAnimating] = useState(false);
    const [animationDirection, setAnimationDirection] = useState<'to-checked' | 'to-unchecked' | null>(null);
    
    const dedupeKey = useMemo(() => {
      return `${generateId()}`;
    }, []);

    // Use the provided gradient or fall back to the default primary gradient
    const activeGradient = gradientClass || gradients.primary;
    
    // Update internal state when prop changes
    useEffect(() => {
      _setCheckboxProxy(checked);
    }, [checked]);
    
    const handleChange = async (value: boolean) => {
      // Set animation direction based on the change
      setAnimationDirection(value ? 'to-checked' : 'to-unchecked');
      setIsAnimating(true);
      
      // End animation after it completes
      setTimeout(() => {
        setIsAnimating(false);
        setAnimationDirection(null);
      }, 350); // Animation duration + a small buffer
      
      await asyncTimeout(0);
      onCheckedChange?.(value);
    };

    const toggleCheckbox = async () => {
      // const dedupe = DedupeThing.getInstance();
      // const shallPass = await dedupe.dedupe(dedupeKey);
      // if (!shallPass) {
      //   dedupe.die();
      //   return;
      // }
      _setCheckboxProxy(prev => {
        handleChange(!prev);
        return !prev;
      });
    };

    // Calculate scaled dimensions based on the scale factor
    const height = Math.round(6 * scaleFactor);
    const width = Math.round(11 * scaleFactor);
    const thumbSize = Math.round(4.75 * scaleFactor);
    
    // Improved positioning calculations for better centering
    // Calculate vertical centering position (top/bottom margin)
    const thumbPosition = Math.round((height - thumbSize) / 2);
    
    // Calculate the distance the thumb should travel
    // This ensures the thumb stays within the track with proper margins on both sides
    const thumbTranslate = width - thumbSize - (thumbPosition * 2);
    
    // Adjust stretch factor to be slightly more proportional to scale
    // This ensures the animation looks consistent at different scales
    const stretchFactor = 1.4 - (0.05 * (Math.max(1, Math.min(10, scaleFactor)) - 5) / 5);

    // Create a CSS style object with all the custom properties
    const switchStyles = {
      height: `${height}px`,
      width: `${width}px`,
      '--thumb-size': `${thumbSize}px`,
      '--thumb-position': `${thumbPosition}px`,
      '--thumb-translate': `${thumbTranslate}px`,
      '--stretched-width': `${thumbSize * stretchFactor}px`,
      '--animation-duration': '350ms',
    } as React.CSSProperties;

    return (
      <div 
        className={cn(
          // Base container styling with dynamic sizing
          'relative inline-flex items-center rounded-full shadow-[0_0_16px_rgba(0,0,0,0.05)]',
          className
        )}
        style={switchStyles}
      >
        {/* Define keyframe animations */}
        <style jsx>{`
          @keyframes stretch-to-checked {
            0% {
              width: var(--thumb-size);
              transform: translateX(0);
            }
            50% {
              width: var(--stretched-width);
              transform: translateX(calc(var(--thumb-translate) * 0.5 - (var(--stretched-width) - var(--thumb-size)) / 2));
            }
            100% {
              width: var(--thumb-size);
              transform: translateX(var(--thumb-translate));
            }
          }
          
          @keyframes stretch-to-unchecked {
            0% {
              width: var(--thumb-size);
              transform: translateX(var(--thumb-translate));
            }
            50% {
              width: var(--stretched-width);
              transform: translateX(calc(var(--thumb-translate) * 0.5 - (var(--stretched-width) - var(--thumb-size)) / 2));
            }
            100% {
              width: var(--thumb-size);
              transform: translateX(0);
            }
          }
        `}</style>

        <input
          ref={ref}
          type="checkbox"
          className={cn(
            // Hidden input that covers the entire switch for accessibility
            'peer w-full h-full',
            'absolute opacity-0 inset-0 cursor-pointer rounded-full transition-all',
          )}
          checked={!!checkboxProxy}
          onTouchStart={() => {
            toggleCheckbox();
            navigator.vibrate(50);
          }}
          {...props}
        />

        <span
          className={cn(
            // Track styling (the background part of the switch)
            'absolute inset-0 cursor-pointer rounded-full transition-all duration-300 ease-in-out pointer-events-none',
            
            // Default state colors (unchecked)
            'bg-zinc-300 dark:bg-zinc-700',
            
            // Checked state colors
            'peer-checked:bg-primary dark:peer-checked:bg-primary',
            
            // Focus state styling
            'peer-focus-visible:ring-2 peer-focus-visible:ring-primary/50 dark:peer-focus-visible:ring-primary/50',
            'peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-white dark:peer-focus-visible:ring-offset-zinc-900',
            
            // Disabled state styling
            'peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
            
            // Visual enhancements - shadows and borders
            'shadow-inner border border-zinc-200/20 dark:border-zinc-600/20',
            
            // Texture - gradients for unchecked state
            activeGradient,
            
            // Texture - gradients for checked state
            !checkboxProxy ? 'filter saturate-0 opacity-50' : 'filter saturate-100 opacity-100',
            // Transition timing
            'transition-all duration-[var(--animation-duration)] ease-in-out  ',
          )}
        />

        {/* Thumb element with keyframe animation */}
        <span
          className={cn(
            // Base positioning and styling
            'absolute rounded-full overflow-hidden pointer-events-none',
            'left-[var(--thumb-position)] top-[var(--thumb-position)]',
            'h-[var(--thumb-size)]',
            'w-[var(--thumb-size)]',
            
            // Non-animated positioning
            !isAnimating && checkboxProxy && 'transform translate-x-[var(--thumb-translate)]',
            
            // Visual styling
            'shadow-md border border-zinc-200/50 dark:border-zinc-700/50',
            gradients.thumb,
          )}
          style={{
            animation: isAnimating 
              ? `${animationDirection === 'to-checked' ? 'stretch-to-checked' : 'stretch-to-unchecked'} var(--animation-duration) cubic-bezier(0.16, 1, 0.3, 1) forwards`
              : 'none',
          }}
        >
          {/* Shine effect overlay */}
          <span 
            className="absolute inset-0 pointer-events-none z-10"
            style={{
              background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0.5) 20%, rgba(255,255,255,0.3) 40%, rgba(255,255,255,0) 60%)',
              borderRadius: 'inherit'
            }}
          />
        </span>
      </div>
    );
  }
);

Switch.displayName = 'Switch';

/**
 * Usage examples:
 * 
 * // Default gradient (emerald to teal)
 * <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
 * 
 * // Custom gradient
 * <Switch 
 *   checked={isEnabled} 
 *   onCheckedChange={setIsEnabled} 
 *   gradientClass="bg-gradient-to-b from-purple-600/70 to-pink-400/70" 
 * />
 * 
 * // Reusing predefined gradients
 * <Switch 
 *   checked={isEnabled} 
 *   onCheckedChange={setIsEnabled} 
 *   gradientClass={gradients.primary} 
 * />
 */ 