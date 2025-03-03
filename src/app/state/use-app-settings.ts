import { useStateManager, useStateManagerSubscription } from '@/hooks/use-state-manager';
import { AppSettings, appSettingsManager } from './app-settings';

/**
 * Hook to access and update app settings
 * @returns [appSettings, setAppSettings, appSettingsManager]
 */
export function useAppSettings(): [
  AppSettings, 
  (updater: AppSettings | ((prevState: AppSettings) => AppSettings)) => void,
  typeof appSettingsManager
] {
  return useStateManager<AppSettings>(
    'app-settings',
    appSettingsManager.getState(),
    { persistence: true, persistenceKey: 'parkbeat-app-settings' }
  );
}

export const useAdminSettings = {
  debugControl: () => useStateManager('admin:debug-control', false, { persistence: true, persistenceKey: 'parkbeat-admin-debug-control' }),
  featureFlags: () => useStateManager('admin:feature-flags', {}, { persistence: true, persistenceKey: 'parkbeat-admin-feature-flags' }),
  ui: () => useStateManager('ui', {}, { persistence: true, persistenceKey: 'parkbeat-ui' }),
};

/**
 * Hook to access and update only the debug control settings
 * @returns [debugControlSettings, updateDebugControlSettings]
 */
export function useDebugControlSettings(): [
  AppSettings['admin']['debugControl'],
  (updater: Partial<AppSettings['admin']['debugControl']>) => void
] {
  const [appSettings, setAppSettings] = useStateManagerSubscription(appSettingsManager);
  
  const updateDebugControlSettings = (
    updater: Partial<AppSettings['admin']['debugControl']>
  ) => {
    setAppSettings(current => ({
      ...current,
      admin: {
        ...current.admin,
        debugControl: {
          ...current.admin.debugControl,
          ...updater,
        },
      },
      lastUpdated: Date.now(),
    }));
  };
  
  return [appSettings.admin.debugControl, updateDebugControlSettings];
}

/**
 * Hook to access and update feature flags
 * @returns [featureFlags, updateFeatureFlag, isFeatureEnabled]
 */
export function useFeatureFlags(): [
  Record<string, boolean>,
  (flagName: string, enabled: boolean) => void,
  (flagName: string, defaultValue?: boolean) => boolean
] {
  const [appSettings, setAppSettings] = useStateManagerSubscription(appSettingsManager);
  
  const updateFeatureFlag = (flagName: string, enabled: boolean) => {
    setAppSettings(current => ({
      ...current,
      admin: {
        ...current.admin,
        featureFlags: {
          ...current.admin.featureFlags,
          [flagName]: enabled,
        },
      },
      lastUpdated: Date.now(),
    }));
  };
  
  const isFeatureEnabled = (flagName: string, defaultValue = false): boolean => {
    return appSettings.admin.featureFlags[flagName] ?? defaultValue;
  };
  
  return [appSettings.admin.featureFlags, updateFeatureFlag, isFeatureEnabled];
}

/**
 * Hook to access and update UI state
 * @returns [uiState, updateUiState]
 */
export function useUiState(): [
  AppSettings['ui'],
  (updater: Partial<AppSettings['ui']>) => void
] {
  const [appSettings, setAppSettings] = useStateManagerSubscription(appSettingsManager);
  
  const updateUiState = (
    updater: Partial<AppSettings['ui']>
  ) => {
    setAppSettings(current => ({
      ...current,
      ui: {
        ...current.ui,
        ...updater,
      },
      lastUpdated: Date.now(),
    }));
  };
  
  return [appSettings.ui, updateUiState];
} 