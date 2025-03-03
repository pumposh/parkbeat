'use client';

import React, { useEffect } from 'react';
import { useStateManager, useStateManagerSubscription } from '../hooks/use-state-manager';
import { StateManager } from '../lib/state-manager';

// Define our shared state type
type CounterState = {
  count: number;
  lastUpdated: number;
  updatedBy: string;
};

// Create a global instance that can be imported directly
export const globalCounterManager = StateManager.getInstance<CounterState>('global-counter', {
  count: 0,
  lastUpdated: Date.now(),
  updatedBy: 'system'
}, {
  persistence: true
});

// Counter component using the useStateManager hook
const Counter: React.FC<{ name: string }> = ({ name }) => {
  // Use the same state manager ID to share state between components
  const [state, setState] = useStateManager<CounterState>('shared-counter', {
    count: 0,
    lastUpdated: Date.now(),
    updatedBy: 'system'
  }, {
    persistence: true
  });

  const increment = () => {
    setState(prev => ({
      count: prev.count + 1,
      lastUpdated: Date.now(),
      updatedBy: name
    }));
  };

  const decrement = () => {
    setState(prev => ({
      count: prev.count - 1,
      lastUpdated: Date.now(),
      updatedBy: name
    }));
  };

  return (
    <div className="p-4 border rounded-lg shadow-sm mb-4">
      <h3 className="text-lg font-semibold mb-2">{name}'s Counter</h3>
      <p className="mb-2">Count: {state.count}</p>
      <p className="text-sm text-gray-600 mb-3">
        Last updated by: {state.updatedBy} at {new Date(state.lastUpdated).toLocaleTimeString()}
      </p>
      <div className="flex space-x-2">
        <button
          onClick={increment}
          className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Increment
        </button>
        <button
          onClick={decrement}
          className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600"
        >
          Decrement
        </button>
      </div>
    </div>
  );
};

// Display component that only shows the state without updating it
const CounterDisplay: React.FC = () => {
  // Use the subscription hook with the global manager
  const [state] = useStateManagerSubscription(globalCounterManager);

  return (
    <div className="p-4 border rounded-lg shadow-sm mb-4 bg-gray-50">
      <h3 className="text-lg font-semibold mb-2">Global Counter Display</h3>
      <p className="mb-2">Count: {state.count}</p>
      <p className="text-sm text-gray-600">
        Last updated by: {state.updatedBy} at {new Date(state.lastUpdated).toLocaleTimeString()}
      </p>
    </div>
  );
};

// Global counter control component
const GlobalCounter: React.FC<{ name: string }> = ({ name }) => {
  // Use the subscription hook with the global manager
  const [state, setState] = useStateManagerSubscription(globalCounterManager);

  const increment = () => {
    setState(prev => ({
      count: prev.count + 1,
      lastUpdated: Date.now(),
      updatedBy: name
    }));
  };

  const decrement = () => {
    setState(prev => ({
      count: prev.count - 1,
      lastUpdated: Date.now(),
      updatedBy: name
    }));
  };

  const reset = () => {
    setState({
      count: 0,
      lastUpdated: Date.now(),
      updatedBy: name
    });
  };

  return (
    <div className="p-4 border rounded-lg shadow-sm mb-4 bg-blue-50">
      <h3 className="text-lg font-semibold mb-2">{name}'s Global Counter</h3>
      <p className="mb-2">Count: {state.count}</p>
      <p className="text-sm text-gray-600 mb-3">
        Last updated by: {state.updatedBy} at {new Date(state.lastUpdated).toLocaleTimeString()}
      </p>
      <div className="flex space-x-2">
        <button
          onClick={increment}
          className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Increment
        </button>
        <button
          onClick={decrement}
          className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600"
        >
          Decrement
        </button>
        <button
          onClick={reset}
          className="px-3 py-1 bg-gray-500 text-white rounded hover:bg-gray-600"
        >
          Reset
        </button>
      </div>
    </div>
  );
};

// Stats component showing listener counts
const StateManagerStats: React.FC = () => {
  const [sharedListeners, setSharedListeners] = React.useState(0);
  const [globalListeners, setGlobalListeners] = React.useState(0);

  useEffect(() => {
    // Get the shared counter manager
    const sharedManager = StateManager.getInstance('shared-counter', {
      count: 0,
      lastUpdated: Date.now(),
      updatedBy: 'system'
    });

    // Update stats every second
    const interval = setInterval(() => {
      setSharedListeners(sharedManager.getListenerCount());
      setGlobalListeners(globalCounterManager.getListenerCount());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-4 border rounded-lg shadow-sm mb-4 bg-yellow-50">
      <h3 className="text-lg font-semibold mb-2">State Manager Stats</h3>
      <p>Shared Counter Listeners: {sharedListeners}</p>
      <p>Global Counter Listeners: {globalListeners}</p>
    </div>
  );
};

// Main component that brings everything together
const StateManagerExample: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">State Manager Example</h1>
      
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Shared State Between Components</h2>
        <p className="mb-4 text-gray-700">
          These counters share state using the same state manager ID.
          Changes in one will be reflected in the other.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Counter name="Alice" />
          <Counter name="Bob" />
        </div>
      </div>
      
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Global State Manager</h2>
        <p className="mb-4 text-gray-700">
          These components use a pre-created global state manager instance.
          The display component only shows the state without updating it.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <GlobalCounter name="Charlie" />
          <CounterDisplay />
        </div>
      </div>
      
      <StateManagerStats />
      
      <div className="mt-8 p-4 border rounded-lg bg-gray-50">
        <h2 className="text-xl font-semibold mb-2">How It Works</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>The <code>StateManager</code> class provides a singleton pattern for managing state.</li>
          <li>Components can share state by using the same manager ID.</li>
          <li>State changes are propagated to all subscribed components.</li>
          <li>The state can be persisted to IndexedDB for persistence across page reloads.</li>
          <li>Components automatically subscribe when mounted and unsubscribe when unmounted.</li>
        </ul>
      </div>
    </div>
  );
};

export default StateManagerExample; 