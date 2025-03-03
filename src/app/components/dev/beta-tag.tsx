'use client';

import { useWebSocketState } from '@/hooks/websocket-manager';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';

/**
 * A small tag that displays "BETA" and indicates the WebSocket connection status
 * through its background color. Clicking on it opens the connection status dialog.
 */
export function BetaTag({ className, onClick }: { className?: string, onClick?: () => void }) {
  const { connectionState } = useWebSocketState();
  
  // Determine color based on connection state
  const getStatusColor = () => {
    switch (connectionState) {
      case 'connected':
        return "from-emerald-600 to-teal-400";
      case 'connecting':
        return "from-gray-500 to-gray-400";
      case 'reconnecting':
        return "from-gray-500 to-gray-400";
      case 'disconnected':
      default:
        return "from-gray-600/50 to-gray-400/50";
    }
  };

  return (
    <div 
      className={cn(
        "transition-all duration-300 ease-in-out bg-gradient-to-r text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-md cursor-pointer",
        getStatusColor(),
        className
      )}
      title={`WebSocket: ${connectionState}`}
      onClick={onClick}
    >
      <span className="tracking-wider flex items-center">
        BETA
      </span>
    </div>
  );
} 