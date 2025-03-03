'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { WebSocketManager, SubscriptionStatus } from '@/hooks/websocket-manager';
import { cn } from '@/lib/utils';
import { SimpleTimer } from '../ui/timer';


function SimpleSubscriptionTimer({ roomKey }: { roomKey: string }) {
  const wsManager = useMemo(() => WebSocketManager.getInstance(), []);
  const [lastPingTime, setLastPingTime] = useState<number | null>(wsManager?.getLastPingTime(roomKey) ?? null);

  const [isRunning, setIsRunning] = useState(true);
  const [initialTime, setInitialTime] = useState<number | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    const updateTimer = () => {
      const currentPingTime = wsManager.getLastPingTime(roomKey);
      if (currentPingTime !== lastPingTime) {
        setLastPingTime(currentPingTime);
        setInitialTime(currentPingTime ? Date.now() - currentPingTime : null);
        setIsRunning(true);
      }
    }

    updateTimer();
    intervalRef.current = setInterval(updateTimer, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [wsManager]);

  return <div className={cn(
      "w-full h-full flex items-center justify-center",
      'transition-all duration-300 ease-in-out',
      lastPingTime ? "opacity-100" : "opacity-0"
    )}
    >
    <SimpleTimer
      key={`${lastPingTime}-${roomKey}`}
      initialTime={initialTime ?? undefined}
      isRunning={isRunning}
      duration={60000}
      showDigital={false}
      onComplete={() => { setIsRunning(false); }}
      showHours={false}
      showMinutes={false}
      showSeconds={isRunning}
      animatedBackground={true}
      backgroundAnimationDuration={45}
    />
  </div>
}

/**
 * Displays a timer showing the elapsed time since the last ping for a room subscription.
 * Changes color based on the elapsed time and subscription status.
 */
export function SubscriptionTimer({ roomKey, simple = false }: { roomKey: string, simple?: boolean }) {
  if (simple) {
    return <SimpleSubscriptionTimer roomKey={roomKey} />
  }

  const wsManager = useMemo(() => WebSocketManager.getInstance(), []);
  const [lastPingTime, setLastPingTime] = useState<number | null>(wsManager?.getLastPingTime(roomKey) ?? null);

  const [elapsedTime, setElapsedTime] = useState<number | null>(null);
  const [status, setStatus] = useState<SubscriptionStatus | null>(wsManager?.getSubscriptionStatus(roomKey) ?? null);
  const [remainingRemovalTime, setRemainingRemovalTime] = useState<number | null>(wsManager?.getRemainingRemovalTime(roomKey) ?? null);
  const [unsubscribeTime, setUnsubscribeTime] = useState<number | null>(wsManager?.getUnsubscribeTime(roomKey) ?? null);
  
  // Update the last ping time and start the timer
  useEffect(() => {
    // Initial fetch of last ping time and status
    const initialPingTime = wsManager.getLastPingTime(roomKey);
    const initialStatus = wsManager.getSubscriptionStatus(roomKey);
    const initialRemovalTime = initialStatus === 'unsubscribed' ? wsManager.getRemainingRemovalTime(roomKey) : null;
    const initialUnsubscribeTime = initialStatus === 'unsubscribed' ? wsManager.getUnsubscribeTime(roomKey) : null;
    
    setLastPingTime(initialPingTime);
    setStatus(initialStatus);
    setRemainingRemovalTime(initialRemovalTime);
    setUnsubscribeTime(initialUnsubscribeTime);
    
    // Set up interval to update elapsed time and check for new ping times
    const interval = setInterval(() => {
      const currentPingTime = wsManager.getLastPingTime(roomKey);
      const currentStatus = wsManager.getSubscriptionStatus(roomKey);
      
      // Update status if it changed
      if (currentStatus !== status) {
        setStatus(currentStatus);
        
        // If status changed to unsubscribed, get the unsubscribe time
        if (currentStatus === 'unsubscribed' && status !== 'unsubscribed') {
          setUnsubscribeTime(wsManager.getUnsubscribeTime(roomKey));
        }
      }
      
      // Update remaining removal time if this is an unsubscribed room
      if (currentStatus === 'unsubscribed') {
        setRemainingRemovalTime(wsManager.getRemainingRemovalTime(roomKey));
      } else {
        setRemainingRemovalTime(null);
      }
      
      // Calculate elapsed time if we have a valid ping time
      if (currentPingTime) {
        const now = Date.now();
        const elapsed = Math.floor((now - currentPingTime) / 1000);
        setElapsedTime(elapsed);
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [wsManager, roomKey]); // Remove lastPingTime and status dependencies
  
  // Calculate the background color based on elapsed time and status
  const backgroundColor = useMemo(() => {
    if (elapsedTime === null) return 'rgba(0, 0, 0, 0)';
    // If the room is unsubscribed, use a grey color with a progress indicator
    if (status === 'unsubscribed' && remainingRemovalTime !== null) {
      // Calculate progress from 0 (just unsubscribed) to 1 (about to be removed)
      const progress = 1 - (remainingRemovalTime / 15000);
      
      // Transition from zinc-400 to zinc-600 as we approach removal
      const r = Math.round(161 - (161 - 82) * progress);
      const g = Math.round(161 - (161 - 82) * progress);
      const b = Math.round(170 - (170 - 91) * progress);
      
      return `rgba(${r}, ${g}, ${b}, 1)`;
    }
    
    // Transition from green to grey over 45 seconds
    const progress = Math.min(elapsedTime / 45, 1);
    
    // Use a two-stage color transition: green -> olive -> gray
    if (progress < 0.5) {
      // Green to olive transition (first 50%)
      const greenToOliveProgress = progress / 0.5;
      const r = Math.round(34 + (130 - 34) * greenToOliveProgress);
      const g = Math.round(197 - (197 - 130) * greenToOliveProgress);
      const b = Math.round(94 - (94 - 61) * greenToOliveProgress);
      return `rgba(${r}, ${g}, ${b}, 1)`;
    } else {
      // Olive to grey transition (50% to 100%)
      const oliveToGreyProgress = (progress - 0.5) / 0.5;
      const r = Math.round(130 + (161 - 130) * oliveToGreyProgress);
      const g = Math.round(130 + (161 - 130) * oliveToGreyProgress);
      const b = Math.round(61 + (170 - 61) * oliveToGreyProgress);
      return `rgba(${r}, ${g}, ${b}, 1)`;
    }
  }, [elapsedTime, status, remainingRemovalTime]);
  
  // Format the displayed time (either elapsed time or remaining removal time)
  const formattedTime = useMemo(() => {
    if (elapsedTime === null) return '';
    // For unsubscribed rooms, show the remaining time until removal
    if (status === 'unsubscribed' && remainingRemovalTime !== null) {
      const remainingSeconds = Math.ceil(remainingRemovalTime / 1000);
      return `${remainingSeconds}s`;
    }

    if (lastPingTime === null) {
      return '';
    }
    
    // For active rooms, show the elapsed time since last ping
    if (elapsedTime < 60) {
      return `${elapsedTime}s`;
    } else {
      const minutes = Math.floor(elapsedTime / 60);
      const seconds = elapsedTime % 60;
      return `${minutes}m ${seconds}s`;
    }
  }, [elapsedTime, status, remainingRemovalTime, lastPingTime]);
  
  if (lastPingTime === null || status === null) return null;
  
  // Prepare tooltip text
  const tooltipText = status === 'unsubscribed' 
    ? `Last ping: ${new Date(lastPingTime).toLocaleTimeString()} | Unsubscribed: ${unsubscribeTime ? new Date(unsubscribeTime).toLocaleTimeString() : 'unknown'}`
    : `Last ping: ${new Date(lastPingTime).toLocaleTimeString()}`;
  
  return (
    <span 
      className={cn(
        "px-2 py-0.5 rounded-full text-xs font-medium text-white transition-colors shadow-sm grid grid-cols-[auto_auto] items-center gap-1",
        status === 'unsubscribed' && "opacity-80"
      )}
      style={{ backgroundColor }}
      title={tooltipText}
    >
      {status === 'unsubscribed' && <i className="fa-solid fa-circle-notch w-4 text-center fa-spin"></i>}
      <span>{formattedTime}</span>
    </span>
  );
} 