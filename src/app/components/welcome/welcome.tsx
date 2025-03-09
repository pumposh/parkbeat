'use client'

import { useRef } from 'react'
import { Logo } from '../ui/logo'
import { useRouter } from 'next/navigation'
import { SignInButton, useUser } from '@clerk/nextjs'
import { Tab } from '../ui/carousel-tabs'
import { CarouselTabs } from '../ui/carousel-tabs'  
import { cn } from '@/lib/utils'

type Step = {
  title: string
  description: string
  icon?: string
  content?: React.ReactNode
  buttonText?: string
}

function TabSkeleton() {
  return (
    <div className="flex flex-col items-center text-center p-4 px-6 gap-4">
      <div className="w-16 h-16 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
      </div>
      <div className="w-full h-12 bg-zinc-100 dark:bg-zinc-800 rounded-lg" />
    </div>
  )
}

const steps: Step[] = [
  {
    title: 'Welcome to Parkbeat',
    description: 'Discover and contribute to green spaces in your community.',
    buttonText: 'Let\'s go',
    content: (<div className="flex flex-col items-center justify-center gap-6 my-12">
      <Logo className="scale-110" />
    </div>)
  },
  {
    title: 'Explore Projects',
    description: 'Find tree planting and park improvement projects near you.',
    icon: 'fa-solid fa-map-location-dot',
  },
  {
    title: 'Join the Conversation',
    description: 'Connect with neighbors and share ideas for your community.',
    icon: 'fa-solid fa-comments'
  },
  {
    title: 'Make an Impact',
    description: 'Contribute to projects and help make your community greener.',
    icon: 'fa-solid fa-hand-holding-heart',
    buttonText: 'Get started'
  }
]

export function WelcomeGuide({ allowSkip = true }: { allowSkip?: boolean }) {
  const router = useRouter()
  const tabsRef = useRef<HTMLDivElement>(null)
  const { user } = useUser()
  
  // Create tabs for GuidedCarouselTabs component
  const tabs: Tab[] = steps.map((step, index) => ({
    id: `step-${index}`,
    label: `Step ${index + 1}`,
    skeleton: <TabSkeleton />,
    icon: <i className={step.icon || ''} aria-hidden="true" />,
    content: (
      <div className="flex flex-col items-center text-center p-4 px-6">
        {step.icon && (
          <div className="mb-4 flex justify-center">
            <div className="w-16 h-16 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
              <i className={cn(step.icon, "text-3xl text-zinc-700 dark:text-zinc-300")} aria-hidden="true" />
            </div>
          </div>
        )}

        {step.content}
        
        <h2 className="text-2xl font-display font-semibold text-zinc-800 dark:text-zinc-200 mb-2">
          {step.title}
        </h2>
        
        <p className="text-zinc-600 dark:text-zinc-400 mb-6 max-w-xs mx-auto">
          {step.description}
        </p>
      </div>
    ),
    className: "welcome-tab-content"
  }))
  
  // Create action component for final step if user isn't signed in
  const actionComponent = user ? undefined : (
    <SignInButton forceRedirectUrl="/projects">
      <button 
        type="button"
        className={cn(
          "min-w-[100px] rounded-2xl bg-emerald-500 hover:bg-emerald-500",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2",
          "h-12 flex items-center justify-center text-white text-xl",
          "opacity-90 hover:opacity-100 focus-visible:opacity-100 focus:opacity-100"
        )}
        aria-label="Get Started"
      >
        <i className="fa-solid fa-check transition-opacity" aria-hidden="true" />
      </button>
    </SignInButton>
  )
  
  return (
    <div className="frosted-glass p-6 px-0 relative shadow-lg w-full">
      <CarouselTabs
        tabs={tabs}
        tabPosition="none"
        className="min-h-[200px] pt-6"
        contentClassName="welcome-tabs-container"
        adaptiveHeight={true}
        completionNavigateTo={user ? "/projects" : undefined}
        dotNavigators={true}
        showControls={true}
        actionComponent={actionComponent}
      />
    </div>
  )
} 

/**
 *   // Handle tab change
  const handleTabChange = (index: number) => {
    console.log('handleTabChange', index, requestedStep)
    if (index === requestedStep || requestedStep === null) {
      setCurrentStep(index)
      setTimeout(() => {
        setRequestedStep(null);
      }, 500)
    }
  }
  
  // Sync the SwipeableTabs with our step buttons
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        nextStep()
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        prevStep()
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentStep])
  
  return (
      <div className="w-full">
        <div className="frosted-glass rounded-xl p-6 px-0 relative shadow-lg">
          <div className="flex flex-col items-center justify-center overflow-visible">
            
            <div className="w-full scrollable-content-mask--at-bottom" ref={tabsRef}>
              <CarouselTabs 
                tabs={tabs} 
                onChange={handleTabChange}
                currentTabIndex={currentStep}
                tabPosition="none"
                className="min-h-[200px] pt-6"
                contentClassName="welcome-tabs-container"
                adaptiveHeight={true}
              />
            </div>
            
            <div className="flex justify-center space-x-1 mb-4">
              {steps.map((_, index) => (
                <div 
                  key={index}
                  className={cn(
                    "h-1 rounded-full transition-all duration-300 cursor-pointer",
                    index === currentStep 
                      ? "w-8 bg-zinc-800 dark:bg-zinc-200" 
                      : "w-2 bg-zinc-300 dark:bg-zinc-600"
                  )}
                  onClick={() => setCurrentStep(index)}
                />
              ))}
            </div>

            <div className="flex justify-between w-full gap-3 px-6">
              {(
                <button 
                  type="button"
                  onClick={prevStep}
                  disabled={currentStep === 0}
                  className={cn(
                    "min-w-[100px] rounded-2xl",
                    "focus-visible:outline-none focus-visible:ring-zinc-300",
                    "dark:focus-visible:ring-zinc-100 hover:ring-zinc-300 dark:hover:ring-zinc-100",
                    "h-12 flex items-center justify-center text-zinc-800 dark:text-zinc-100 text-xl",
                    "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-transparent disabled:ring-0 disabled:hover:ring-0 disabled:hover:bg-transparent"
                  )}
                  aria-label="Back"
                >
                  <i className="fa-solid fa-arrow-left transition-opacity" aria-hidden="true" />
                </button>
              )}
              
              {currentStep === steps.length - 1 && !user ? (
                <SignInButton forceRedirectUrl="/projects">
                  <button 
                    type="button"
                    className={cn(
                      "min-w-[100px] rounded-2xl bg-emerald-500 hover:bg-emerald-500",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2",
                      "h-12 flex items-center justify-center text-white text-xl",
                      "opacity-90 hover:opacity-100 focus-visible:opacity-100 focus:opacity-100"
                    )}
                    aria-label="Get Started"
                  >
                    <i className="fa-solid fa-check transition-opacity" aria-hidden="true" />
                  </button>
                </SignInButton>
              ) : (
                <button 
                  type="button"
                  onClick={nextStep}
                  className={cn(
                    "min-w-[100px] rounded-2xl bg-emerald-500 hover:bg-emerald-500",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2",
                    "h-12 flex items-center justify-center text-white text-xl",
                    "opacity-90 hover:opacity-100 focus-visible:opacity-100 focus:opacity-100"
                  )}
                  aria-label="Continue"
                >
                  {currentStep === steps.length - 1 ? (
                    <i className="fa-solid fa-check transition-opacity" aria-hidden="true" />
                  ) : (
                    <i className="fa-solid fa-arrow-right transition-opacity" aria-hidden="true" />
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

 */