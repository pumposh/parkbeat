'use client'
import Image from "next/image"
import ParkbeatLogo from "@/../public/parkbeat.svg"
import Mask from "@/../public/mask-no-background.png"
import "./style.css"
import { cn } from "@/lib/utils"
import { useState, useEffect, useMemo } from "react"
import { useWebSocketState } from "@/hooks/websocket-manager"
import * as Dialog from '@radix-ui/react-dialog'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { WebSocketManager, SubscriptionStatus } from "@/hooks/websocket-manager"

const Tree = ({ className }: { className?: string }) => {
  const [isLoaded, setIsLoaded] = useState(false)
  const tree = (
    <Image
      src={ParkbeatLogo}
      onLoad={() => setIsLoaded(true)}
      alt="Parkbeat Logo"
      fill
      sizes="(max-width: 768px) 96px, 96px"
      className={cn("transition-opacity duration-150 ease-in-out object-cover dark:invert overflow-hidden brightness-110 dark:brightness-[1.95] dark:contrast-[0.8] scale-125 logo-shadow mt-1.5 !h-[86%] object-top", className)}
      style={{ opacity: isLoaded ? 1 : 0 }}
      priority
      loading="eager"
      fetchPriority="high"
    />
  )
  return tree
}


const MaskEl = () => {
  const [isLoaded, setIsLoaded] = useState(false)
  const mask = (
    <Image
      src={Mask}
      onLoad={() => setIsLoaded(true)}
      alt="Mask"
      fill
      priority
      loading="eager"
      fetchPriority="high"
      sizes="(max-width: 768px) 96px, 96px"
      className="transition-opacity duration-150 ease-in-out absolute inset-0 object-contain overflow-visible scale-[1.65] brightness-[0.9] dark:brightness-[0.83]"
      style={{ opacity: isLoaded ? 1 : 0 }}
    />
  )
  return mask
}

// Subscription timer component that shows elapsed time since last ping
const SubscriptionTimer = ({ roomKey }: { roomKey: string }) => {
  const [elapsedTime, setElapsedTime] = useState(0);
  const [lastPingTime, setLastPingTime] = useState<number | null>(null);
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [remainingRemovalTime, setRemainingRemovalTime] = useState<number | null>(null);
  const [unsubscribeTime, setUnsubscribeTime] = useState<number | null>(null);
  const wsManager = useMemo(() => WebSocketManager.getInstance(), []);
  
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
      
      // Update last ping time if it changed
      if (currentPingTime !== null && (lastPingTime === null || currentPingTime > lastPingTime)) {
        setLastPingTime(currentPingTime);
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
    // If the room is unsubscribed, use a grey color with a progress indicator
    if (status === 'unsubscribed' && remainingRemovalTime !== null) {
      // Calculate progress from 0 (just unsubscribed) to 1 (about to be removed)
      const progress = 1 - (remainingRemovalTime / 15000);
      
      // Transition from zinc-400 to zinc-600 as we approach removal
      const r = Math.round(161 - (161 - 82) * progress);
      const g = Math.round(161 - (161 - 82) * progress);
      const b = Math.round(170 - (170 - 91) * progress);
      
      return `rgb(${r}, ${g}, ${b})`;
    }
    
    // Transition from green to grey over 45 seconds
    const progress = Math.min(elapsedTime / 45, 1);
    
    // Use a more sophisticated color transition
    if (progress < 0.3) {
      // Green to yellow transition (first 30%)
      const greenToYellowProgress = progress / 0.3;
      const r = Math.round(34 + (255 - 34) * greenToYellowProgress);
      const g = 197;
      const b = Math.round(94 * (1 - greenToYellowProgress));
      return `rgb(${r}, ${g}, ${b})`;
    } else if (progress < 0.7) {
      // Yellow to orange transition (30% to 70%)
      const yellowToOrangeProgress = (progress - 0.3) / 0.4;
      const r = 255;
      const g = Math.round(197 - 97 * yellowToOrangeProgress);
      const b = 0;
      return `rgb(${r}, ${g}, ${b})`;
    } else {
      // Orange to grey transition (70% to 100%)
      const orangeToGreyProgress = (progress - 0.7) / 0.3;
      const r = Math.round(255 - (255 - 161) * orangeToGreyProgress);
      const g = Math.round(100 + (161 - 100) * orangeToGreyProgress);
      const b = Math.round(0 + 170 * orangeToGreyProgress);
      return `rgb(${r}, ${g}, ${b})`;
    }
  }, [elapsedTime, status, remainingRemovalTime]);
  
  // Format the displayed time (either elapsed time or remaining removal time)
  const formattedTime = useMemo(() => {
    // For unsubscribed rooms, show the remaining time until removal
    if (status === 'unsubscribed' && remainingRemovalTime !== null) {
      const remainingSeconds = Math.ceil(remainingRemovalTime / 1000);
      return `${remainingSeconds}s`;
    }
    
    // For active rooms, show the elapsed time since last ping
    if (elapsedTime < 60) {
      return `${elapsedTime}s`;
    } else {
      const minutes = Math.floor(elapsedTime / 60);
      const seconds = elapsedTime % 60;
      return `${minutes}m ${seconds}s`;
    }
  }, [elapsedTime, status, remainingRemovalTime]);
  
  if (lastPingTime === null || status === null) return null;
  
  // Prepare tooltip text
  const tooltipText = status === 'unsubscribed' 
    ? `Last ping: ${new Date(lastPingTime).toLocaleTimeString()} | Unsubscribed: ${unsubscribeTime ? new Date(unsubscribeTime).toLocaleTimeString() : 'unknown'}`
    : `Last ping: ${new Date(lastPingTime).toLocaleTimeString()}`;
  
  return (
    <span 
      className={cn(
        "ml-2 px-2 py-0.5 rounded-full text-xs font-medium text-white transition-colors shadow-sm",
        status === 'unsubscribed' && "opacity-80"
      )}
      style={{ backgroundColor }}
      title={tooltipText}
    >
      {status === 'unsubscribed' && <i className="fa-solid fa-hourglass-half mr-1 fa-spin-pulse"></i>}
      {formattedTime}
    </span>
  );
};

export const BetaTag = ({ className }: { className?: string }) => {
  const [open, setOpen] = useState(false);
  const { connectionState, activeSubscriptions, unsubscribedRooms, isConnected, hookCount } = useWebSocketState();
  
  // For debugging - log active subscriptions when they change
  useEffect(() => {
    console.log('[BetaTag] Active subscriptions:', activeSubscriptions);
    console.log('[BetaTag] Unsubscribed rooms:', unsubscribedRooms);
  }, [activeSubscriptions, unsubscribedRooms]);
  
  // Determine color based on connection state
  const getStatusColor = () => {
    switch (connectionState) {
      case 'connected':
        return "from-emerald-600 to-teal-400";
      case 'connecting':
        return "from-amber-500 to-yellow-400";
      case 'reconnecting':
        return "from-amber-500 to-yellow-400";
      case 'disconnected':
      default:
        return "from-red-600 to-rose-400";
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <div 
          className={cn(
            "bg-gradient-to-r text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-md cursor-pointer",
            getStatusColor(),
            className
          )}
          title={`WebSocket: ${connectionState}`}
        >
          <span className="tracking-wider flex items-center">
            BETA {connectionState === 'disconnected' ? (
              <i className="ml-1 fa-solid fa-circle-xmark text-[8px]"></i>
            ) : connectionState === 'connecting' ? (
              <i className="ml-1 fa-solid fa-spinner fa-spin text-[8px]"></i>
            ) : (
              null
            )}
          </span>
        </div>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0" />
        <Dialog.Content className="dialog-content fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md p-4 overflow-visible">
          <div className="pointer-events-auto">
            <div className="frosted-glass p-6 rounded-2xl">
              <div className="flex justify-between items-center mb-4 border-b pb-3 dark:border-zinc-700">
                <Dialog.Title className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">
                  <i className="fa-solid fa-wifi mr-2"></i>
                  Connection status
                </Dialog.Title>
                <Dialog.Close className="rounded-full p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 transition-colors">
                  <i className="fa-solid fa-times"></i>
                  <VisuallyHidden>Close</VisuallyHidden>
                </Dialog.Close>
                <VisuallyHidden>
                  <Dialog.Description>
                    Connection status
                  </Dialog.Description>
                </VisuallyHidden>
              </div>
              <div className="py-2">
                <div className="mb-6 space-y-3">
                  <div className="flex justify-between items-center p-2 bg-zinc-50/80 dark:bg-zinc-800/80 rounded-md">
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">
                      <i className="fa-solid fa-signal mr-2 text-zinc-500 dark:text-zinc-400"></i>
                      Status
                    </span>
                    <span className={cn(
                      "px-2 py-0.5 rounded-full text-xs font-medium text-white",
                      connectionState === 'connected' ? "bg-emerald-500" :
                      connectionState === 'disconnected' ? "bg-red-500" :
                      "bg-amber-500"
                    )}>
                      {connectionState}
                      {connectionState === 'connected' && <i className="fa-solid fa-check ml-1"></i>}
                      {connectionState === 'disconnected' && <i className="fa-solid fa-times ml-1"></i>}
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-zinc-50/80 dark:bg-zinc-800/80 rounded-md">
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">
                      <i className="fa-solid fa-plug mr-2 text-zinc-500 dark:text-zinc-400"></i>
                      Active hooks
                    </span>
                    <span className="px-2 py-0.5 bg-zinc-200 dark:bg-zinc-700 rounded-full text-xs font-medium text-zinc-800 dark:text-zinc-300">
                      {hookCount}
                    </span>
                  </div>
                </div>
                
                <div className="mb-3 font-medium text-zinc-800 dark:text-zinc-200">
                  <i className="fa-solid fa-satellite-dish mr-2 text-zinc-500 dark:text-zinc-400"></i>
                  Active subscriptions <span className="text-sm text-zinc-500 dark:text-zinc-400">({activeSubscriptions.length})</span>
                </div>
                {activeSubscriptions.length > 0 || unsubscribedRooms.length > 0 ? (
                  <div className="max-h-60 overflow-y-auto border border-zinc-200 dark:border-zinc-700 rounded-md bg-white/80 dark:bg-zinc-900/80">
                    <ul className="divide-y divide-zinc-200 dark:divide-zinc-700">
                      {activeSubscriptions.map((id) => (
                        <li key={id} className="px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center justify-between">
                          <span className="flex items-center">
                            <i className="fa-solid fa-circle text-[8px] text-emerald-500 mr-2"></i>
                            {id}
                          </span>
                          <SubscriptionTimer roomKey={id} />
                        </li>
                      ))}
                      {unsubscribedRooms.map((id) => (
                        <li key={`unsub-${id}`} className="px-3 py-2 text-sm text-zinc-500 dark:text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-800/50">
                          <span className="flex items-center">
                            <i className="fa-solid fa-circle text-[8px] text-zinc-400 mr-2"></i>
                            {id}
                            <span className="ml-2 text-xs italic">unsubscribing...</span>
                          </span>
                          <SubscriptionTimer roomKey={id} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="text-sm text-zinc-500 dark:text-zinc-400 italic p-3 bg-zinc-50/80 dark:bg-zinc-800/80 rounded-md">
                    <i className="fa-solid fa-info-circle mr-2"></i>
                    No active subscriptions
                    {connectionState !== 'connected' && (
                      <span className="block mt-1 text-xs">
                        <i className="fa-solid fa-circle-exclamation mr-1"></i>
                        Connect to the WebSocket server to see subscriptions
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export const Logo = ({
  className,
  showBetaTag = true
}: {
  className?: string
  showBetaTag?: boolean
}) => {
  return (
    <div className={cn("relative dark:bg-[#ffffff69] w-24 h-24 rounded-full p-2 outline outline-8 outline-zinc-300 dark:outline-zinc-500 dark:invert shadow-xl overflow-visible transition-opacity duration-300 ease-in-out", className)}
    style={{ backgroundColor: '#F2F0E630' }}>
      <Tree />
      <MaskEl />
      {showBetaTag && <BetaTag className="
        absolute
        -bottom-2
        left-1/2
        translate-y-1/2
        -translate-x-1/2
        dark:invert
        " />}
    </div>
  )
}