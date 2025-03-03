import { getLogger } from '@/lib/logger';
import { StateManager } from '@/lib/state-manager';

/**
 * App settings state type definition
 */
export interface AppSettings {
  // User preferences
  preferences: {
    darkMode: boolean;
    fontSize: 'small' | 'medium' | 'large';
    notifications: boolean;
    language: string;
  };
  
  // Admin settings
  admin: {
    // Debug control settings
    debugControl: {
      visible: boolean;
      position: { x: number; y: number };
      expanded: boolean;
      // Last time the debug control was toggled
      lastToggled: number;
    };
    // Feature flags
    featureFlags: Record<string, boolean>;
  };
  
  // UI state
  ui: {
    sidebarCollapsed: boolean;
    lastViewedPage: string;
  };
  
  // Last updated timestamp
  lastUpdated: number;
}

/**
 * Default app settings
 */
const DEFAULT_APP_SETTINGS: AppSettings = {
  preferences: {
    darkMode: false,
    fontSize: 'medium',
    notifications: true,
    language: 'en',
  },
  admin: {
    debugControl: {
      visible: false,
      position: { x: 20, y: 20 },
      expanded: false,
      lastToggled: Date.now(),
    },
    featureFlags: {},
  },
  ui: {
    sidebarCollapsed: false,
    lastViewedPage: '/',
  },
  lastUpdated: Date.now(),
};

// Create a singleton instance of the app settings state manager
export const appSettingsManager = StateManager.getInstance<AppSettings>(
  'app-settings',
  DEFAULT_APP_SETTINGS,
  {
    persistence: true,
    persistenceKey: 'parkbeat-app-settings',
  }
);

/**
 * Helper functions for common app settings operations
 */

/**
 * Toggle the debug control visibility
 * @returns The new visibility state
 */
export function toggleDebugControlVisibility(): boolean {
  const currentSettings = appSettingsManager.getState();
  const newVisibility = !currentSettings.admin.debugControl.visible;
  
  appSettingsManager.setState({
    ...currentSettings,
    admin: {
      ...currentSettings.admin,
      debugControl: {
        ...currentSettings.admin.debugControl,
        visible: newVisibility,
        lastToggled: Date.now(),
      },
    },
    lastUpdated: Date.now(),
  });
  
  return newVisibility;
}

/**
 * Update the debug control position
 * @param position New position coordinates
 */
export function updateDebugControlPosition(position: { x: number; y: number }): void {
  const currentSettings = appSettingsManager.getState();
  
  appSettingsManager.setState({
    ...currentSettings,
    admin: {
      ...currentSettings.admin,
      debugControl: {
        ...currentSettings.admin.debugControl,
        position,
      },
    },
    lastUpdated: Date.now(),
  });
}

/**
 * Toggle the debug control expanded state
 * @returns The new expanded state
 */
export function toggleDebugControlExpanded(): boolean {
  const currentSettings = appSettingsManager.getState();
  const newExpanded = !currentSettings.admin.debugControl.expanded;
  
  appSettingsManager.setState({
    ...currentSettings,
    admin: {
      ...currentSettings.admin,
      debugControl: {
        ...currentSettings.admin.debugControl,
        expanded: newExpanded,
      },
    },
    lastUpdated: Date.now(),
  });
  
  return newExpanded;
}

/**
 * Toggle dark mode
 * @returns The new dark mode state
 */
export function toggleDarkMode(): boolean {
  const currentSettings = appSettingsManager.getState();
  const newDarkMode = !currentSettings.preferences.darkMode;
  
  appSettingsManager.setState({
    ...currentSettings,
    preferences: {
      ...currentSettings.preferences,
      darkMode: newDarkMode,
    },
    lastUpdated: Date.now(),
  });
  
  return newDarkMode;
}

/**
 * Update a feature flag
 * @param flagName Name of the feature flag
 * @param enabled Whether the feature is enabled
 */
export function updateFeatureFlag(flagName: string, enabled: boolean): void {
  const currentSettings = appSettingsManager.getState();
  
  appSettingsManager.setState({
    ...currentSettings,
    admin: {
      ...currentSettings.admin,
      featureFlags: {
        ...currentSettings.admin.featureFlags,
        [flagName]: enabled,
      },
    },
    lastUpdated: Date.now(),
  });
}

/**
 * Check if a feature flag is enabled
 * @param flagName Name of the feature flag
 * @param defaultValue Default value if the flag doesn't exist
 * @returns Whether the feature is enabled
 */
export function isFeatureEnabled(flagName: string, defaultValue = false): boolean {
  const currentSettings = appSettingsManager.getState();
  return currentSettings.admin.featureFlags[flagName] ?? defaultValue;
}

/**
 * Reset all app settings to default values
 */
export function resetAppSettings(): void {
  appSettingsManager.resetState(DEFAULT_APP_SETTINGS);
} 