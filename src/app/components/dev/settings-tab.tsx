'use client';

import React from 'react';
import { useAdminSettings, useDebugControlSettings, useFeatureFlags } from '@/app/state/use-app-settings';
import { Switch } from '@/app/components/ui/switch';
import { Label } from '@/app/components/ui/label';
import { Button } from '@/app/components/ui/button';
import { resetAppSettings, toggleDebugControlVisibility } from '@/app/state/app-settings';
import { cn } from '@/lib/utils';

/**
 * Settings tab component for the debug menu
 */
export function SettingsTab() {
  const [debugControlVisible, updateDebugControlVisible] = useAdminSettings.debugControl();
  const [featureFlags, updateFeatureFlags] = useAdminSettings.featureFlags();
  
  const updateFeatureFlag = (flagName: string, enabled: boolean) => {
    updateFeatureFlags(prev => ({
      ...prev,
      [flagName]: enabled,
    }));
  };

  return (
    <div className="space-y-6 p-4 px-6">
      <div className="space-y-4">
        <h3 className="text-sm font-medium">Debugging </h3>
        
        <div className="space-y-3">
          <div className="frosted-glass flex items-center justify-between px-4 py-2 rounded-xl">
            <Label htmlFor="debug-visible" className="flex items-center gap-2">
              <i className="fa-solid fa-ghost text-zinc-500" />
              Floating debug control
            </Label>
            <Switch
              id="debug-visible"
              checked={debugControlVisible}
              onCheckedChange={(value: boolean) => updateDebugControlVisible(value)}
            />
          </div>
        </div>
      </div>
      
      <div className="space-y-4">
        <h3 className="text-sm font-medium">Feature Flags</h3>
        
        <div className="frosted-glass p-4 space-y-3">
          {Object.entries(featureFlags).map(([flag, enabled]) => (
            <div key={flag} className="flex items-center justify-between">
              <Label htmlFor={`flag-${flag}`} className="flex items-center gap-2">
                <i className="fa-solid fa-flag text-zinc-500" />
                {flag}
              </Label>
              <Switch
                id={`flag-${flag}`}
                checked={!!enabled}
                onCheckedChange={(checked: boolean) => updateFeatureFlag(flag, checked)}
              />
            </div>
          ))}
          
          {Object.keys(featureFlags).length === 0 && (
            <p className="text-sm text-zinc-500">No feature flags defined</p>
          )}
          
          <div className="pt-2 flex gap-2">
            <Button
              className="w-full shadow-2xl"
              size="sm"
              onClick={() => {
                const flagName = prompt('Enter feature flag name:');
                if (flagName) {
                  updateFeatureFlag(flagName, true);
                }
              }}
            >
              <i className="fa-solid fa-plus mr-2" />
              <span>Add Flag</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
} 