'use client';

import { useState, useEffect } from 'react';
import { useWebSocketState } from '@/hooks/websocket-manager';
import { cn } from '@/lib/utils';
import { SubscriptionTimer } from './subscription-timer';
import { useLoggerContext } from '@/providers/logger-provider';
import { useRemoteLoggerContext } from '@/providers/remote-logger-provider';
import { ParkbeatLogger } from '@/lib/logger';
import { 
  DebugPanel, 
  DebugToggleButton, 
  DebugButton, 
  DebugSelect, 
  DebugLabel,
  DebugInput
} from './debug-ui';
import * as Dialog from '@radix-ui/react-dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { CarouselTabs } from '@/app/components/ui/carousel-tabs';
import useDelayedMemo from '@/hooks/use-delayed-memo';
import { useMemo } from 'react';
import { SettingsTab } from './settings-tab';
import { SimpleTimer } from '../ui/timer';
import { Switch } from '../ui/switch';

interface DebugMenuProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  initialTabId?: string;
  additionalTabs?: Array<{
    id: string;
    label: string;
    icon: React.ReactNode;
    content: React.ReactNode;
  }>;
}

/**
 * A reusable debug menu component with tabs for different debugging features
 */
export function DebugMenu({ 
  isOpen, 
  onOpenChange,
  initialTabId = 'connection',
  additionalTabs = []
}: DebugMenuProps) {
  /** Allows exit animation to complete before dialog is removed from DOM */
  const isDialogOpenDelayed = useDelayedMemo(() => isOpen, [isOpen], 300);

  // Get WebSocket state for displaying in the control
  const {
    connectionState,
    activeSubscriptions,
    unsubscribedRooms,
    hookCount
  } = useWebSocketState();

  // Get logger context
  const { 
    isEnabled: isLoggerEnabled, 
    logLevel, 
    setEnabled: setLoggerEnabled, 
    setLogLevel 
  } = useLoggerContext();

  // Get remote logger context
  const { 
    isEnabled: isRemoteLoggerEnabled, 
    enableLogging, 
    disableLogging 
  } = useRemoteLoggerContext();

  // Remote logger state
  const [serverUrl, setServerUrl] = useState('http://localhost:3030/logs');

  // Combine active and unsubscribed rooms for display
  const allRooms = useMemo(() => [
    ...activeSubscriptions.map(id => ({ id, status: 'subscribed' as const })),
    ...unsubscribedRooms.map(id => ({ id, status: 'unsubscribed' as const }))
  ].sort((a, b) => a.id.localeCompare(b.id)), [activeSubscriptions, unsubscribedRooms]);

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

  // Find the initial tab index
  const initialTabIndex = (() => {
    const defaultTabs = [
      { id: 'connection' },
      { id: 'logging' },
      { id: 'settings' }
    ];
    
    const allTabs = [...defaultTabs, ...additionalTabs];
    const index = allTabs.findIndex(tab => tab.id === initialTabId);
    return index >= 0 ? index : 0;
  })();

  // Define tab content for the debug dialog
  const debugTabs = [
    {
      id: 'connection',
      label: 'Connection',
      icon: <i className="fa-solid fa-wifi" />,
      content: (
        <div className="p-6 pt-0 overflow-y-auto">
          <div className="py-2">
            <div className="mb-1 space-y-3">
              <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 p-2 bg-zinc-50/80 dark:bg-zinc-800/80 rounded-md">
                <i className="fa-solid fa-tower-broadcast w-5 text-center text-zinc-500 dark:text-zinc-400"></i>
                <span className="font-medium text-zinc-700 dark:text-zinc-300">
                  WS status
                </span>
                <span className={cn(
                  "px-2 py-0.5 rounded-full text-xs font-medium text-white grid grid-cols-[auto_auto] items-center gap-1",
                  connectionState === 'connected' ? "primary-gradient" :
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
                  Component hooks
                </span>
                <span className="px-2 py-0.5 bg-zinc-200 dark:bg-zinc-700 rounded-full text-xs font-medium text-zinc-800 dark:text-zinc-300 grid grid-cols-[auto] items-center">
                  {hookCount}
                </span>
              </div>
              <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 p-2 mb-0 bg-zinc-50/80 dark:bg-zinc-800/80 rounded-md">
                <i className="fa-solid fa-satellite-dish w-5 text-center text-zinc-500 dark:text-zinc-400"></i>
                <span className="font-medium text-zinc-700 dark:text-zinc-300">
                  Active subscriptions
                </span>
                <span className="px-2 py-0.5 pb-0 bg-zinc-200 dark:bg-zinc-700 rounded-full text-xs font-medium text-zinc-800 dark:text-zinc-300 grid grid-cols-[auto] items-center">
                  {activeSubscriptions.length}
                </span>
              </div>
            </div>
            
            {allRooms.length > 0 ? (
              <div className="mx-3 mt-0 max-h-60 overflow-y-auto border border-zinc-200 dark:border-zinc-700 rounded-md bg-white/80 dark:bg-zinc-900/80">
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
      )
    },
    {
      id: 'logging',
      label: 'Logging',
      icon: <i className="fa-solid fa-terminal" />,
      content: (
        <div className="p-6 pt-0 overflow-y-auto">
          <div className="pt-2">
            <div className="mb-6 space-y-4">
              {/* Local Logger Controls */}
              <div className="frosted-glass p-3 border border-zinc-200 dark:border-zinc-700 rounded-md">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 flex items-center">
                    <i className="fa-solid fa-terminal mr-2 text-zinc-500 dark:text-zinc-400"></i>
                    Local logger
                  </h3>
                  <Switch 
                    checked={isLoggerEnabled}
                    onCheckedChange={setLoggerEnabled}
                    scaleFactor={3.5}
                    aria-label="Toggle local logger"
                  />
                </div>
                
                <div>
                  <DebugLabel>Log level:</DebugLabel>
                  <DebugSelect
                    value={logLevel}
                    onChange={(value) => setLogLevel(value as ParkbeatLogger.LogLevel)}
                    options={['debug', 'info', 'warn', 'error'].map(level => ({
                      value: level,
                      label: level.charAt(0).toUpperCase() + level.slice(1)
                    }))}
                  />
                </div>
              </div>
              
              {/* Remote Logger Controls */}
              <div className="frosted-glass p-3 border border-zinc-200 dark:border-zinc-700 rounded-md">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 flex items-center">
                    <i className="fa-solid fa-bug mr-2 text-zinc-500 dark:text-zinc-400"></i>
                    Remote logger
                  </h3>
                  <Switch 
                    checked={isRemoteLoggerEnabled}
                    onCheckedChange={(checked) => checked ? enableLogging(serverUrl) : disableLogging()}
                    scaleFactor={3.5}
                    aria-label="Toggle remote logger"
                  />
                </div>
                
                <div>
                  <DebugLabel>Server URL:</DebugLabel>
                  <DebugInput
                    value={serverUrl}
                    onChange={setServerUrl}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: <i className="fa-solid fa-gear" />,
      content: <SettingsTab />
    },
    ...additionalTabs
  ];

  return (
    <Dialog.Root open={isOpen} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0" />
        <Dialog.Content className="dialog-content fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md p-4 overflow-visible max-h-[90vh] flex flex-col">
          <div className="pointer-events-auto flex flex-col flex-1 overflow-hidden">
            <div className="frosted-glass rounded-2xl relative grid grid-rows-[auto_1fr_auto] overflow-hidden">
              {/* Close button */}
              <button
                onClick={() => onOpenChange(false)}
                className="absolute top-7 right-4 z-10 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                aria-label="Close dialog"
              >
                <i className="fa-solid fa-times text-lg"></i>
              </button>
              
              <VisuallyHidden className="p-8 pb-0 flex items-center justify-between">
                <Dialog.Title className="sr-only">
                  Debug controls
                </Dialog.Title>
                <Dialog.Description className="sr-only">
                  Debug and logging controls for development
                </Dialog.Description>
              </VisuallyHidden>

              <div className="overflow-y-hidden flex-1 flex flex-col">
                <div className="p-6 pb-0">
                  <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 pr-8">
                    Debug controls
                  </h1>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Development tools for debugging and logging
                  </p>
                </div>
                
                <div className="flex-1 overflow-hidden flex flex-col">
                  <CarouselTabs 
                    tabs={debugTabs}
                    adaptiveHeight={true}
                    contentClassName="h-auto"
                    tabPosition="bottom"
                    className="mt-auto mb-2 relative"
                  />
                </div>
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
} 