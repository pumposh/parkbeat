/**
 * This file provides examples of how to use the StateManager class
 * for managing shared state across components.
 */

import { StateManager } from './state-manager';

// Example 1: Basic usage with primitive values
// ============================================

// Create a counter state manager
const counterManager = StateManager.getInstance('counter', 0);

// Get the current state
const currentCount = counterManager.getState(); // 0

// Update the state
counterManager.setState(currentCount + 1); // Now state is 1

// Update the state using a function
counterManager.setState(prevCount => prevCount + 1); // Now state is 2

// Subscribe to state changes
const listenerId = counterManager.subscribe(newCount => {
  console.log('Counter changed:', newCount);
});

// Unsubscribe when no longer needed
counterManager.unsubscribe(listenerId);

// Example 2: Complex state with objects
// ====================================

// Define a user state type
type UserState = {
  isLoggedIn: boolean;
  username: string | null;
  preferences: {
    darkMode: boolean;
    notifications: boolean;
  };
};

// Initial user state
const initialUserState: UserState = {
  isLoggedIn: false,
  username: null,
  preferences: {
    darkMode: false,
    notifications: true
  }
};

// Create a user state manager with persistence enabled
const userManager = StateManager.getInstance('user', initialUserState, {
  persistence: true,
  persistenceKey: 'app-user-state'
});

// Update a nested property
userManager.setState(prevState => ({
  ...prevState,
  preferences: {
    ...prevState.preferences,
    darkMode: true
  }
}));

// Set user as logged in
userManager.setState(prevState => ({
  ...prevState,
  isLoggedIn: true,
  username: 'john.doe'
}));

// Example 3: Using with collections (Map, Set)
// ===========================================

// Define a chat state with a Map of messages
type ChatState = {
  messages: Map<string, {
    id: string;
    text: string;
    sender: string;
    timestamp: number;
  }>;
  activeUsers: Set<string>;
};

// Initial chat state
const initialChatState: ChatState = {
  messages: new Map(),
  activeUsers: new Set()
};

// Create a chat state manager
const chatManager = StateManager.getInstance('chat', initialChatState);

// Add a new message
chatManager.setState(prevState => {
  const newMessages = new Map(prevState.messages);
  const messageId = `msg-${Date.now()}`;
  
  newMessages.set(messageId, {
    id: messageId,
    text: 'Hello, world!',
    sender: 'john.doe',
    timestamp: Date.now()
  });
  
  return {
    ...prevState,
    messages: newMessages
  };
});

// Add a new active user
chatManager.setState(prevState => {
  const newActiveUsers = new Set(prevState.activeUsers);
  newActiveUsers.add('jane.smith');
  
  return {
    ...prevState,
    activeUsers: newActiveUsers
  };
});

// Example 4: Multiple components sharing state
// ===========================================

// Component 1: Gets the state manager instance
function component1() {
  // In a real component, you would use the useStateManager hook
  const manager = StateManager.getInstance('shared', { count: 0, text: '' });
  
  // Update the state
  manager.setState({ count: 1, text: 'Updated from component 1' });
}

// Component 2: Subscribes to the same state manager
function component2() {
  // In a real component, you would use the useStateManager hook
  const manager = StateManager.getInstance('shared', { count: 0, text: '' });
  
  // Subscribe to changes
  const listenerId = manager.subscribe(newState => {
    console.log('State updated in component 2:', newState);
    // This will log: { count: 1, text: 'Updated from component 1' }
  });
  
  // Don't forget to unsubscribe when the component unmounts
  // cleanup() {
  //   manager.unsubscribe(listenerId);
  // }
}

// Example 5: Cleanup
// =================

// When you're completely done with a state manager, you can clean it up
function cleanupExample() {
  const manager = StateManager.getInstance('temporary', { value: 'temp' });
  
  // Do something with the manager...
  
  // Clean up when done
  manager.cleanup();
  
  // After cleanup, getInstance will create a new instance
  const newManager = StateManager.getInstance('temporary', { value: 'new' });
  // newManager.getState() will be { value: 'new' }
} 