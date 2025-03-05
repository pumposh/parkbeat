'use client'

import React, { useState, useEffect } from 'react'
import { Autosize } from './component'

/**
 * Example component demonstrating how to use the Autosize component
 * including its SSR compatibility
 */
export const AutosizeExample = () => {
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 })
  const [showExtra, setShowExtra] = useState(false)
  const [isClient, setIsClient] = useState(false)

  // This effect will only run on the client
  useEffect(() => {
    setIsClient(true)
  }, [])

  return (
    <div className="p-4 border rounded-lg">
      <h2 className="text-xl font-bold mb-4">Autosize Component Example</h2>
      
      <div className="mb-4 flex gap-4">
        <button 
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          onClick={() => setShowExtra(!showExtra)}
        >
          {showExtra ? 'Hide' : 'Show'} Extra Content
        </button>
        
        <div className="px-4 py-2 bg-gray-100 rounded">
          <span className="font-medium">Rendering mode:</span>{' '}
          {isClient ? 'Client-side' : 'Server-side'}
        </div>
      </div>
      
      <div className="mb-4">
        <p>Current dimensions: {dimensions.width.toFixed(0)}px × {dimensions.height.toFixed(0)}px</p>
        {!isClient && (
          <p className="text-gray-500 italic mt-1">
            (Dimensions will be calculated after client-side hydration)
          </p>
        )}
      </div>
      
      <div className="border border-gray-300 rounded p-2 mb-4">
        <Autosize
          className="bg-gray-100 rounded p-4"
          onResize={setDimensions}
          minHeight={100}
          // Providing a custom ID for demonstration
          id="example-autosize-container"
        >
          <div className="flex flex-col gap-4">
            <div className="bg-white p-4 rounded shadow">
              <h3 className="font-bold">Base Content</h3>
              <p>This content is always visible.</p>
              <p className="text-sm text-gray-500 mt-2">
                The Autosize component works in both server-side and client-side rendering.
              </p>
            </div>
            
            {showExtra && (
              <div className="bg-white p-4 rounded shadow">
                <h3 className="font-bold">Extra Content</h3>
                <p>This content appears and disappears, causing the Autosize component to resize.</p>
                <div className="mt-4 p-4 bg-gray-50 rounded">
                  <p>Additional nested content to demonstrate deeper nesting.</p>
                </div>
              </div>
            )}
          </div>
        </Autosize>
      </div>
      
      <div className="bg-gray-50 p-4 rounded">
        <h3 className="font-bold mb-2">How It Works</h3>
        <p>
          The Autosize component uses ResizeObserver to monitor its children and adjust its own size accordingly.
          When you click the button above, it adds or removes content, causing the component to resize.
        </p>
        <p className="mt-2">
          The component reports its dimensions through the onResize callback, which updates the displayed values.
        </p>
        <p className="mt-2 text-blue-600">
          <strong>SSR Support:</strong> During server-side rendering, the component renders with default dimensions.
          After client-side hydration, it initializes the ResizeObserver and adjusts to the actual content size.
          The component uses React's useId hook to generate deterministic IDs that are consistent between server and client renders.
        </p>
      </div>
    </div>
  )
}

export default AutosizeExample 