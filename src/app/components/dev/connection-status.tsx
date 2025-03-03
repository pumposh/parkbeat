'use client';

import { useWebSocketState } from '@/hooks/websocket-manager';
import { useState, useMemo, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { cn } from '@/lib/utils';
import { SubscriptionTimer } from './subscription-timer';

/**
 * A dialog component that displays the WebSocket connection status and active subscriptions.
 * This is a development tool to help debug WebSocket connections.
 */
export function ConnectionStatus({ 
  onClose,
  showTrigger = true,
  isOpen
}: { 
  onClose?: () => void;
  showTrigger?: boolean;
  isOpen?: boolean;
}) {
  const [open, setOpen] = useState(isOpen ?? true);
  const {
    connectionState,
    activeSubscriptions,
    unsubscribedRooms,
    hookCount
  } = useWebSocketState();
  
  // For debugging - log active subscriptions when they change
  useEffect(() => {
    console.log('[ConnectionStatus] Active subscriptions:', activeSubscriptions);
    console.log('[ConnectionStatus] Unsubscribed rooms:', unsubscribedRooms);
  }, [activeSubscriptions, unsubscribedRooms]);

  // Update open state when isOpen prop changes
  useEffect(() => {
    if (isOpen !== undefined) {
      setOpen(isOpen);
    }
  }, [isOpen]);

  const allRooms = useMemo(() => [
      ...activeSubscriptions.map(id => ({ id, status: 'subscribed' })),
      ...unsubscribedRooms.map(id => ({ id, status: 'unsubscribed' }))
    ].sort((a, b) => a.id.localeCompare(b.id)),
  [activeSubscriptions, unsubscribedRooms]);

  // Handle dialog close
  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen && onClose) {
      onClose();
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      {showTrigger && (
        <Dialog.Trigger asChild>
          <button 
            className="fixed bottom-20 left-20 z-50 bg-indigo-500 hover:bg-indigo-600 text-white p-2 rounded-full shadow-lg"
            title="Connection Status"
          >
            <i className="fa-solid fa-wifi"></i>
          </button>
        </Dialog.Trigger>
      )}
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
                  <i className="fa-solid fa-times w-4 text-center"></i>
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
                  <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 p-2 bg-zinc-50/80 dark:bg-zinc-800/80 rounded-md">
                    <i className="fa-solid fa-tower-broadcast w-5 text-center text-zinc-500 dark:text-zinc-400"></i>
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">
                      Status
                    </span>
                    <span className={cn(
                      "px-2 py-0.5 rounded-full text-xs font-medium text-white grid grid-cols-[auto_auto] items-center gap-1",
                      connectionState === 'connected' ? "bg-emerald-500" :
                      connectionState === 'disconnected' ? "bg-red-500" :
                      "bg-amber-500"
                    )}>
                      <span>{connectionState}</span>
                      {connectionState === 'connected' && <i className="fa-solid fa-check w-4 text-center"></i>}
                      {connectionState === 'disconnected' && <i className="fa-solid fa-times w-4 text-center"></i>}
                    </span>
                  </div>
                  <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 p-2 bg-zinc-50/80 dark:bg-zinc-800/80 rounded-md">
                    <i className="fa-solid fa-plug w-5 text-center text-zinc-500 dark:text-zinc-400"></i>
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">
                      Active hooks
                    </span>
                    <span className="px-2 py-0.5 bg-zinc-200 dark:bg-zinc-700 rounded-full text-xs font-medium text-zinc-800 dark:text-zinc-300 grid grid-cols-[auto] items-center">
                      {hookCount}
                    </span>
                  </div>
                  <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 p-2 bg-zinc-50/80 dark:bg-zinc-800/80 rounded-md">
                    <i className="fa-solid fa-satellite-dish w-5 text-center text-zinc-500 dark:text-zinc-400"></i>
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">
                      Active subscriptions
                    </span>
                    <span className="px-2 py-0.5 bg-zinc-200 dark:bg-zinc-700 rounded-full text-xs font-medium text-zinc-800 dark:text-zinc-300 grid grid-cols-[auto] items-center">
                      {activeSubscriptions.length}
                    </span>
                  </div>
                </div>
                
                {allRooms.length > 0 ? (
                  <div className="mt-3 max-h-60 overflow-y-auto border border-zinc-200 dark:border-zinc-700 rounded-md bg-white/80 dark:bg-zinc-900/80">
                    <ul className="divide-y divide-zinc-200 dark:divide-zinc-700">
                      {allRooms.map(({ id, status }) => (
                        <li key={id} className="px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 grid grid-cols-[auto_1fr_auto] items-center gap-2">
                          <i className={cn(
                            "w-5 text-center text-zinc-500 dark:text-zinc-400 fa-solid",
                            id.startsWith('geohash:') ? "fa-map-location-dot" : "fa-seedling"
                          )}></i>
                          <span>{id}</span>
                          {status === 'subscribed' && (
                            <SubscriptionTimer roomKey={id} />
                          )} {status === 'unsubscribed' && (
                            <span className="text-xs italic">Recently unsubscribed</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="mt-3 text-sm text-zinc-500 dark:text-zinc-400 italic p-3 bg-zinc-50/80 dark:bg-zinc-800/80 rounded-md grid grid-cols-[auto_1fr] items-start gap-2">
                    <i className="fa-solid fa-info-circle w-5 text-center text-zinc-500 dark:text-zinc-400"></i>
                    <div>
                      No active subscriptions
                      {connectionState !== 'connected' && (
                        <div className="mt-1 text-xs grid grid-cols-[auto_1fr] items-center gap-2">
                          <i className="fa-solid fa-circle-exclamation w-5 text-center text-zinc-500 dark:text-zinc-400"></i>
                          <span>Connect to the WebSocket server to see subscriptions</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
} 