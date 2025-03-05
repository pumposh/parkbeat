'use client'

import { useState } from 'react'
import { CarouselTabs, Tab } from './carousel-tabs'

export function CarouselTabsExample() {
  const [currentTabIndex, setCurrentTabIndex] = useState(0)

  // Example tabs with different heights
  const tabs: Tab[] = [
    {
      id: 'tab1',
      label: 'Short',
      icon: '📝',
      content: (
        <div className="p-4">
          <h2 className="text-lg font-semibold mb-2">Short Content</h2>
          <p>This tab has minimal content to demonstrate height adaptation.</p>
        </div>
      )
    },
    {
      id: 'tab2',
      label: 'Medium',
      icon: '📊',
      content: (
        <div className="p-4">
          <h2 className="text-lg font-semibold mb-2">Medium Content</h2>
          <p className="mb-2">This tab has a moderate amount of content.</p>
          <p className="mb-2">The container height should adjust smoothly when switching between tabs.</p>
          <p className="mb-2">You can also see the height interpolation in action when swiping between tabs.</p>
        </div>
      )
    },
    {
      id: 'tab3',
      label: 'Long',
      icon: '📚',
      content: (
        <div className="p-4">
          <h2 className="text-lg font-semibold mb-2">Long Content</h2>
          <p className="mb-2">This tab has a lot of content to demonstrate scrolling.</p>
          <p className="mb-2">When the content is taller than the viewport, it will become scrollable.</p>
          <p className="mb-2">Notice the gradient mask at the top and bottom of scrollable content.</p>
          <p className="mb-2">The mask changes based on the scroll position.</p>
          <div className="bg-zinc-100 dark:bg-zinc-800 rounded-lg p-4 mb-2">
            <h3 className="font-semibold mb-1">Scroll to see mask behavior</h3>
            <p>The mask will change as you scroll up and down.</p>
          </div>
          <p className="mb-2">The height interpolation feature ensures smooth transitions between tabs.</p>
          <p className="mb-2">As you swipe between tabs, the height adjusts based on your swipe position.</p>
          <p className="mb-2">This creates a fluid, natural feeling interaction.</p>
          <p className="mb-2">Try slowly swiping between this tab and the others.</p>
          <p className="mb-2">Notice how the height interpolates in real-time based on your scroll position.</p>
          <p>This final paragraph demonstrates a tall scrollable area.</p>
        </div>
      )
    },
    {
      id: 'tab4',
      label: 'Footer',
      icon: '⚙️',
      content: (
        <div className="p-4">
          <h2 className="text-lg font-semibold mb-2">Footer Extension</h2>
          <p className="mb-2">This tab demonstrates the footer extension feature.</p>
          <p className="mb-2">Notice the additional UI that appears above the tab buttons.</p>
          <p>This can be used for tab-specific actions or information.</p>
        </div>
      ),
      footerExtension: (
        <div className="bg-zinc-100 dark:bg-zinc-800 rounded-lg px-3 py-2 flex gap-2 items-center justify-between w-full">
          <button className="text-xs bg-zinc-200 dark:bg-zinc-700 px-2 py-1 rounded">Action 1</button>
          <span className="text-xs text-zinc-500">Footer extension example</span>
          <button className="text-xs bg-zinc-200 dark:bg-zinc-700 px-2 py-1 rounded">Action 2</button>
        </div>
      ),
      footerExtensionClassName: "bg-zinc-50 dark:bg-zinc-900"
    }
  ]

  // Handle tab change
  const handleTabChange = (index: number) => {
    setCurrentTabIndex(index)
  }

  return (
    <div className="bg-white dark:bg-zinc-950 rounded-xl p-4">
      <h1 className="text-xl font-semibold mb-4">CarouselTabs Example</h1>
      
      {/* Top positioned tabs */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-2">Tabs on Top</h2>
        <CarouselTabs 
          tabs={tabs} 
          onChange={handleTabChange}
          currentTabIndex={currentTabIndex}
          adaptiveHeight={true}
          tabPosition="top"
        />
      </div>
      
      {/* Bottom positioned tabs */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-2">Tabs on Bottom</h2>
        <CarouselTabs 
          tabs={tabs} 
          adaptiveHeight={true}
          tabPosition="bottom"
        />
      </div>
      
      {/* Fixed height example */}
      <div>
        <h2 className="text-lg font-semibold mb-2">Fixed Height (No Adaptation)</h2>
        <CarouselTabs 
          tabs={tabs} 
          adaptiveHeight={false}
          tabPosition="top"
          className="h-40"
        />
      </div>
    </div>
  )
} 