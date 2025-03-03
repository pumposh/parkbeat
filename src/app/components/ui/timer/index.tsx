import "./timer.css";
import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface SimpleTimerProps {
  /**
   * Duration in milliseconds
   */
  duration: number;
  /**
   * Initial time in milliseconds
   */
  initialTime?: number;
  /**
   * Whether the timer is running
   */
  isRunning?: boolean;
  /**
   * Callback when timer completes
   */
  onComplete?: () => void;
  /**
   * Size variant of the timer
   */
  size?: 'sm' | 'md' | 'lg';
  /**
   * Whether to show the digital display
   */
  showDigital?: boolean;
  /**
   * Whether to show the hour hand
   */
  showHours?: boolean;
  /**
   * Whether to show the seconds hand
   */
  showSeconds?: boolean;
  /**
   * Whether to show the minutes hand
   */
  showMinutes?: boolean;
  /**
   * Whether to show the progress indicator
   */
  showProgress?: boolean;
  /**
   * Whether to use the animated background
   */
  animatedBackground?: boolean;
  /**
   * Duration for the background animation in seconds (defaults to 45s for active, 15s for inactive)
   */
  backgroundAnimationDuration?: number;
  /**
   * Additional class names
   */
  className?: string;
}

export const SimpleTimer: React.FC<SimpleTimerProps> = ({ 
  duration, // ms amount of time to run the timer for
  initialTime = 0, // ms amount of time to start the timer at
  isRunning = true, 
  onComplete, 
  size = 'md',
  showDigital = true,
  showHours = true,
  showMinutes = true,
  showSeconds = true,
  showProgress = true,
  animatedBackground = false,
  backgroundAnimationDuration,
  className 
}) => {
  const timerRef = useRef<HTMLDivElement>(null);
  const [timeRemaining, setTimeRemaining] = useState(duration);
  const endTimeRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // Calculate CSS variables for custom duration
  const totalSeconds = Math.ceil(duration / 1000);
  const secondsDuration = `${Math.min(totalSeconds, 60)}s`;
  const minutesDuration = `${Math.min(totalSeconds * 60, 3600)}s`;
  const hoursDuration = `${Math.min(totalSeconds * 3600, 43200)}s`;
  
  // Set animation duration for background
  const animDuration = backgroundAnimationDuration 
    ? `${backgroundAnimationDuration}s` 
    : isRunning ? '45s' : '15s';
  
  // Calculate initial positions for hands
  const calculateInitialPositions = () => {
    const totalSec = Math.ceil(
      initialTime !== null
        ? initialTime
        : duration / 1000,
      );
    
    // Calculate seconds position (0-60)
    const initialSeconds = totalSec % 60;
    
    // Calculate minutes position (0-60)
    const totalMinutes = Math.floor(totalSec / 60);
    const initialMinutes = totalMinutes % 60;
    
    // Calculate hours position (0-12)
    const totalHours = Math.floor(totalMinutes / 60);
    const initialHours = totalHours % 12;
    
    return {
      seconds: initialSeconds / 60,
      minutes: initialMinutes / 60,
      hours: initialHours / 12
    };
  };
  
  const initialPositions = calculateInitialPositions();
  
  // Format time for digital display
  const formatTime = (ms: number) => {
    const totalSec = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSec / 60);
    const seconds = totalSec % 60;
    
    if (showHours && minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return `${hours}:${mins.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };
  
  // Generate tick marks
  const renderTicks = () => {
    const ticks = [];
    for (let i = 0; i < 60; i++) {
      const rotation = `rotate(${i * 6}deg)`;
      ticks.push(
        <div 
          key={i} 
          className="timer-tick" 
          style={{ transform: rotation }}
        />
      );
    }
    return ticks;
  };
  
  // Update timer state based on isRunning prop
  useEffect(() => {
    // Clear any existing timeout
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    
    if (isRunning) {
      // Set the end time when starting
      if (!endTimeRef.current) {
        endTimeRef.current = Date.now() + timeRemaining;
      }
      
      // Update the time remaining every second for the digital display
      const updateTimeRemaining = () => {
        if (endTimeRef.current) {
          const timeRemaining = Math.max(0, endTimeRef.current - Date.now());
          
          if (timeRemaining <= 0) {
            onComplete?.();
            clearInterval(intervalRef.current ?? 0);
          }
        }
      };
      
      intervalRef.current = setInterval(updateTimeRemaining, 1000);
    } else if (!isRunning && endTimeRef.current) {
      // If paused, update the time remaining and clear the end time
      const timeRemaining = Math.max(0, endTimeRef.current - Date.now());
      if (timeRemaining <= 0) {
        onComplete?.();
      }
      clearInterval(intervalRef.current ?? 0);
      endTimeRef.current = null;
    }
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning]);
  
  // Reset timer when duration changes
  useEffect(() => {
    setTimeRemaining(duration);
    endTimeRef.current = isRunning ? Date.now() + duration : null;
  }, [duration, isRunning]);
  
  // Calculate progress percentage
  const progressPercentage = `${Math.min(100, 100 - (timeRemaining / duration) * 100)}%`;
  
  return (
    <div 
      className={cn(
        "timer-container", 
        size === 'sm' ? 'timer-sm' : size === 'lg' ? 'timer-lg' : '',
        className
      )}
    >
      <div 
        ref={timerRef}
        className={cn(
          "timer",
          isRunning ? "timer-running" : "timer-paused",
          animatedBackground && "timer-animated-bg"
        )}
        style={{
          '--seconds-duration': secondsDuration,
          '--minutes-duration': minutesDuration,
          '--hours-duration': hoursDuration,
          '--progress-percentage': progressPercentage,
          '--initial-seconds': initialPositions.seconds,
          '--initial-minutes': initialPositions.minutes,
          '--initial-hours': initialPositions.hours,
          '--animation-duration': animDuration,
        } as React.CSSProperties}
      >
        {showProgress && (
          <div className="timer-progress"></div>
        )}
        
        {showHours && (
          <div className="timer-hand timer-hand-hours" style={{ transform: `translateX(-50%) rotate(${initialPositions.hours * 360}deg)` }}></div>
        )}
        
        {showMinutes && (
          <div className="timer-hand timer-hand-minutes" style={{ transform: `translateX(-50%) rotate(${initialPositions.minutes * 360}deg)` }}></div>
        )}
        
        {showSeconds && (
          <div className="timer-hand timer-hand-seconds" style={{ transform: `translateX(-50%) rotate(${initialPositions.seconds * 360}deg)` }}></div>
        )}
        
        {showDigital && (
          <div className="timer-digital">
            {formatTime(timeRemaining)}
          </div>
        )}
      </div>
    </div>
  );
};

