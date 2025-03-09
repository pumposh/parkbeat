import * as Dialog from '@radix-ui/react-dialog'
import { useState, useRef, useEffect, useLayoutEffect, type ReactNode, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'

const TRANSITION_DURATION = 300 // ms

let stepIdCounter = 0
const generateStepId = (step: number) => `step-${step}-${++stepIdCounter}`

interface CancelConfirmation {
  title: string
  subtitle: string
}

interface CancelAction {
  type: 'draft-or-delete'
  draftTitle: string
  deleteTitle: string
  subtitle: string
  onSaveAsDraft?: () => void
  onDelete?: () => void
  isDeleting?: boolean
}

export interface StepFormDialogStep {
  title: string
  onSubmit?: () => void | Promise<void>
  content: ReactNode
  canProgress?: boolean
  style?: {
    fullHeight?: boolean
    hideHeader?: boolean
  }
}

interface StepFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  steps: StepFormDialogStep[]
  currentStep: number
  onStepChange?: (step: number) => void
  onClose?: () => void
  onCancel?: () => void
  onSubmit?: () => void
  isSubmitting?: boolean
  canSubmit?: boolean
  cancelConfirmation?: CancelConfirmation
  cancelAction?: CancelAction
  isDeleting?: boolean
}

export interface StepFormDialogStepState {
  id: string
  content: ReactNode
  title: string
  status: 'entering' | 'active' | 'exiting'
  direction: 'forward' | 'backward'
}

export function StepFormDialog({
  open,
  onOpenChange,
  steps,
  currentStep,
  onStepChange,
  onClose,
  onCancel,
  onSubmit,
  isSubmitting,
  canSubmit = true,
  cancelConfirmation,
  cancelAction
}: StepFormDialogProps) {
  const currentStepData = steps[currentStep]
  const [_direction, setDirection] = useState<'forward' | 'backward'>('forward')
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [activeSteps, setActiveSteps] = useState<StepFormDialogStepState[]>([])
  const [contentHeight, setContentHeight] = useState<number>(0)
  const [isHeightTransitioning, setIsHeightTransitioning] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const contentContainerRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const footerRef = useRef<HTMLDivElement>(null)
  const resizeObserver = useRef<ResizeObserver | null>(null)
  const stepRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const [scrollPosition, setScrollPosition] = useState<'top' | 'middle' | 'bottom' | null>(null)
  
  if (!currentStepData) {
    return null
  }

  const requiresScrollView = useMemo(() => {
    if (!contentRef.current || !contentContainerRef.current) return false
    const contentHeight = contentRef.current.getBoundingClientRect().height
    const contentContainerHeight = contentContainerRef.current.getBoundingClientRect().height
    console.log('[step-form-dialog] contentHeight', contentHeight)
    console.log('[step-form-dialog] contentContainerHeight', contentContainerHeight)
    return contentHeight >= contentContainerHeight
  }, [contentRef, contentContainerRef])

  // Initialize active steps
  useLayoutEffect(() => {
    if (activeSteps.length === 0 && open) {
      const initialStep: StepFormDialogStepState = {
        id: generateStepId(currentStep),
        content: currentStepData.content,
        title: currentStepData.title,
        status: 'active',
        direction: 'forward'
      }
      setActiveSteps([initialStep])
    }
  }, [currentStep, currentStepData?.content, currentStepData?.title, activeSteps.length, open])

  // Setup resize observer
  useEffect(() => {
    if (!contentRef.current) return

    if (resizeObserver.current) {
      resizeObserver.current.disconnect()
      resizeObserver.current = null
    }

    const height = contentRef.current?.getBoundingClientRect().height
    setIsHeightTransitioning(true)
    setTimeout(() => {
      setIsHeightTransitioning(false)
    }, TRANSITION_DURATION)
    setContentHeight(height)

    // Create observer to watch content height changes
    resizeObserver.current = new ResizeObserver(entries => {
      for (const entry of entries) {
        // Get the first element with actual content height
        const contentElement = Array.from(entry.target.children).find(
          child => child instanceof HTMLElement && child.offsetHeight > 0
        )
        if (contentElement instanceof HTMLElement) {
          let height = contentElement.getBoundingClientRect().height + 64

          // Get header and footer heights, including padding
          const headerHeight = Number(headerRef.current?.getBoundingClientRect().height || 0)
          const footerHeight = Number(footerRef.current?.getBoundingClientRect().height || 0)
          const paddingPx = 0
          
          const availableHeight = window.innerHeight - headerHeight - footerHeight - paddingPx
          
          // If content is taller than available space, constrain it
          if (height > availableHeight) {
            height = availableHeight
          }

          setContentHeight(height)
          setIsHeightTransitioning(true)
          setTimeout(() => {
            setIsHeightTransitioning(false)
          }, TRANSITION_DURATION)
        }
      }
    })

    // Start observing
    resizeObserver.current.observe(contentRef.current)

    return () => {
      if (resizeObserver.current) {
        resizeObserver.current.disconnect()
      }
    }
  }, [contentRef.current])

  // Add scroll position detection
  useEffect(() => {
    const content = contentContainerRef.current
    if (!content) return

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = content
      const isAtTop = scrollTop === 0
      const isAtBottom = Math.abs(scrollHeight - clientHeight - scrollTop) < 1

      if (isAtTop) {
        setScrollPosition('top')
      } else if (isAtBottom) {
        setScrollPosition('bottom')
      } else {
        setScrollPosition('middle')
      }
    }

    content.addEventListener('scroll', handleScroll)
    // Initial check
    handleScroll()

    return () => {
      content.removeEventListener('scroll', handleScroll)
    }
  }, [contentContainerRef.current])

  // Handle dialog close with transition
  const handleDialogChange = (isOpen: boolean) => {
    if (!isOpen) {
      onClose?.()
      onOpenChange(false)
      // Clear steps when dialog is fully closed
      setActiveSteps([])
    } else {
      onOpenChange(true)
    }
  }

  // Handle step changes
  useEffect(() => {
    if (!currentStepData || !open) return

    const newStepId = generateStepId(currentStep)
    const existingStep = activeSteps.find(step => step.id.startsWith(`step-${currentStep}-`))

    if (existingStep) return

    const currentStepNumber = parseInt(activeSteps[0]?.id.split('-')[1] || '0', 10)
    const newDirection: 'forward' | 'backward' = currentStepNumber < currentStep ? 'forward' : 'backward'

    setDirection(newDirection)
    setIsTransitioning(true)

    // Start transition by setting current step to exit and adding new step in entering state
    setActiveSteps(prev => [
      ...prev.map(step => ({
        ...step,
        status: 'exiting' as const,
        direction: newDirection
      })),
      {
        id: newStepId,
        content: currentStepData.content,
        title: currentStepData.title,
        status: 'entering' as const,
        direction: newDirection
      }
    ])

    // Complete the transition after duration
    setTimeout(() => {
      setActiveSteps([{
        id: newStepId,
        content: currentStepData.content,
        title: currentStepData.title,
        status: 'active' as const,
        direction: newDirection
      }])
      setIsTransitioning(false)
    }, TRANSITION_DURATION)
  }, [currentStep, currentStepData, steps, open])

  const isLastStep = currentStep === steps.length - 1

  const handleStepChange = (nextStep: number) => {
    if (isTransitioning) return
    
    // Check if current step allows progression
    const currentStepData = steps[currentStep]
    if (nextStep > currentStep && !currentStepData?.canProgress) {
      return
    }

    if (nextStep > currentStep && currentStepData?.onSubmit) {
      currentStepData.onSubmit()
    }
    
    onStepChange?.(nextStep)
  }

  const handleCancel = () => {
    if (cancelAction?.type === 'draft-or-delete') {
      setShowCancelConfirm(true)
    } else if (cancelConfirmation) {
      setShowCancelConfirm(true)
    } else {
      onCancel?.() || onClose?.()
    }
  }

  const handleConfirmCancel = () => {
    setShowCancelConfirm(false)
    onCancel?.() || onClose?.()
  }

  const handleSaveAsDraft = () => {
    setShowCancelConfirm(false)
    cancelAction?.onSaveAsDraft?.()
  }

  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => {
      console.log('[step-form-dialog] isOpen', isOpen)
      handleDialogChange(isOpen)
    }}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0" />
        <Dialog.Content 
          className="dialog-content fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl p-4 overflow-visible max-h-[100dvh] flex flex-col"
          aria-describedby="step-form-dialog-description"
        >
          <VisuallyHidden>
            <Dialog.Title>
              {currentStepData.title}
            </Dialog.Title>
          </VisuallyHidden>
          <div className="pointer-events-auto flex flex-col flex-1 overflow-hidden">
            <div className="frosted-glass rounded-2xl relative grid grid-rows-[auto_1fr_auto] overflow-hidden">
              <div id="step-form-dialog-header" className={cn(
                "p-8 pt-4 pb-0 space-y-2 transition-opacity duration-300",
                currentStepData.style?.hideHeader && "hidden"
              )}
              ref={headerRef}
              >
                <div className="text-sm text-zinc-500 dark:text-zinc-400">
                  Step {currentStep + 1} of {steps.length}
                </div>
                <Dialog.Title className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
                  {currentStepData.title}
                </Dialog.Title>
                <Dialog.Description id="step-form-dialog-description" className="sr-only">
                  Multi-step form dialog. Use left and right arrow buttons to navigate between steps. Current step: {currentStepData.title}
                </Dialog.Description>
              </div>

              <div 
                className={cn(
                  "StepFormDialog__content relative overflow-y-scroll flex-0 transition-[height] duration-300 ease-in-out pb-0",
                  isHeightTransitioning && 'overflow-hidden',
                  requiresScrollView && scrollPosition === 'top' && 'StepFormDialog__content--at-top',
                  requiresScrollView && scrollPosition === 'bottom' && 'StepFormDialog__content--at-bottom'
                )}
                ref={contentContainerRef}
                style={{
                  height: `calc(${contentHeight}px)` || 'auto',
                  maxHeight: '100%',
                  minHeight: '200px',
                }}
              >
                <div ref={contentRef} className="StepFormDialog__content-wrapper overflow-hidden h-auto w-auto px-8 py-4" style={{
                  minHeight: 'fit-content',
                }}>         
                  {activeSteps.map((step) => (
                    <div
                      key={step.id}
                      ref={el => {
                        if (el) {
                          stepRefs.current.set(step.id, el)
                        } else {
                          stepRefs.current.delete(step.id)
                        }
                      }}
                      className={cn(
                        "transition-all duration-300 ease-in-out",
                        step.status === 'entering' && step.direction === 'forward' && 'translate-x-full',
                        step.status === 'entering' && step.direction === 'backward' && '-translate-x-full',
                        step.status === 'active' && 'translate-x-0',
                        step.status === 'exiting' && step.direction === 'forward' && '-translate-x-full',
                        step.status === 'exiting' && step.direction === 'backward' && 'translate-x-full',
                        step.status === 'entering' && 'opacity-0',
                        step.status === 'active' && 'opacity-100',
                        step.status === 'exiting' && 'opacity-0'
                      )}
                    >
                      {step.content}
                    </div>
                  ))}
                </div>
              </div>

              <div ref={footerRef} id="step-form-dialog-footer" className="pt-0 p-8 pb-4 flex items-center justify-between gap-3">
                {currentStep === 0 ? (
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="rounded-2xl frosted-glass focus-visible:outline-none focus-visible:ring-zinc-300 dark:focus-visible:ring-zinc-100 hover:ring-zinc-300 dark:hover:ring-zinc-100 h-10 flex items-center justify-center text-zinc-800 dark:text-zinc-100 text-xl disabled:cursor-not-allowed disabled:hover:ring-0 px-8 py-2"
                    aria-label="Cancel"
                  >
                    <i className="fa-solid fa-xmark transition-opacity" aria-hidden="true" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleStepChange(currentStep - 1)}
                    disabled={isTransitioning}
                    className="rounded-2xl frosted-glass focus-visible:outline-none focus-visible:ring-zinc-300 dark:focus-visible:ring-zinc-100 hover:ring-zinc-300 dark:hover:ring-zinc-100 h-10 flex items-center justify-center text-zinc-800 dark:text-zinc-100 text-xl disabled:cursor-not-allowed disabled:hover:ring-0 px-8 py-2"
                    aria-label="Previous step"
                  >
                    <i className="fa-solid fa-arrow-left transition-opacity" aria-hidden="true" />
                  </button>
                )}
                <div className="flex items-center gap-3">
                  {isLastStep ? (
                    <button
                      type="submit"
                      onClick={onSubmit}
                      disabled={!canSubmit || isSubmitting}
                      className="rounded-2xl transition-all bg-emerald-500 hover:bg-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 h-10 flex items-center justify-center text-white text-xl disabled:cursor-not-allowed disabled:bg-emerald-500/50 px-8 py-2"
                      aria-label="Submit"
                    >
                      <i className={`fa-solid ${isSubmitting ? 'fa-circle-notch fa-spin' : 'fa-check'} transition-opacity ${isSubmitting || !canSubmit ? 'opacity-60' : 'opacity-100'}`} aria-hidden="true" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleStepChange(currentStep + 1)}
                      disabled={!steps[currentStep]?.canProgress}
                      className={cn(
                        "rounded-2xl h-10 flex items-center justify-center text-xl px-8 py-2 transition-all",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                        "disabled:cursor-not-allowed",
                        steps[currentStep]?.canProgress ? [
                          "bg-emerald-500 hover:bg-emerald-600",
                          "focus-visible:ring-emerald-500",
                          "text-white",
                        ] : [
                          "frosted-glass",
                          "focus-visible:ring-zinc-300 dark:focus-visible:ring-zinc-100",
                          "hover:ring-zinc-300 dark:hover:ring-zinc-100",
                          "text-zinc-800 dark:text-zinc-100",
                          "disabled:hover:ring-0 disabled:opacity-30"
                        ]
                      )}
                      aria-label="Next step"
                    >
                      <i className={cn(
                        "fa-solid fa-arrow-right transition-opacity"
                      )} aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>

      {/* Cancel Action Dialog */}
      {cancelAction?.type === 'draft-or-delete' && (
        <Dialog.Root open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
          <Dialog.Portal>
            <Dialog.Title className="sr-only">Cancel Action</Dialog.Title>
            <Dialog.Overlay className="dialog-overlay fixed inset-0" />
            <Dialog.Content className="dialog-content fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md p-4">
              <div className="pointer-events-auto">
                <div className="frosted-glass rounded-2xl overflow-hidden">
                  <div className="p-8 space-y-4">
                    <Dialog.Description className="text-zinc-500 dark:text-zinc-400">
                      {cancelAction.subtitle}
                    </Dialog.Description>
                    <div className="flex flex-col gap-3">
                      <button
                        type="button"
                        disabled={cancelAction.isDeleting}
                        onClick={handleSaveAsDraft}
                        className="w-full rounded-lg bg-emerald-500 hover:bg-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 h-12 flex items-center justify-center text-white"
                      >
                        {cancelAction.isDeleting ? (
                          <i className="fa-solid fa-circle-notch fa-spin" aria-hidden="true" />
                        ) : (
                          cancelAction.draftTitle
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={cancelAction.onDelete}
                        className="w-full rounded-lg bg-red-500 hover:bg-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 h-12 flex items-center justify-center text-white"
                      >
                        {cancelAction.deleteTitle}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowCancelConfirm(false)}
                        className="w-full rounded-lg frosted-glass focus-visible:outline-none focus-visible:ring-zinc-300 dark:focus-visible:ring-zinc-100 hover:ring-zinc-300 dark:hover:ring-zinc-100 h-12 flex items-center justify-center text-zinc-800 dark:text-zinc-100"
                      >
                        Keep editing
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}

      {/* Cancel Confirmation Dialog */}
      {cancelConfirmation && !cancelAction && (
        <Dialog.Root open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
          <Dialog.Portal>
            <Dialog.Overlay className="dialog-overlay fixed inset-0" />
            <Dialog.Content className="dialog-content fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md p-4">
              <div className="pointer-events-auto">
                <div className="frosted-glass rounded-2xl overflow-hidden">
                  <div className="p-8 space-y-4">
                    <Dialog.Title className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
                      {cancelConfirmation.title}
                    </Dialog.Title>
                    <Dialog.Description className="text-zinc-500 dark:text-zinc-400">
                      {cancelConfirmation.subtitle}
                    </Dialog.Description>
                    <div className="flex gap-3 pt-4">
                      <button
                        type="button"
                        onClick={() => setShowCancelConfirm(false)}
                        className="flex-1 rounded-lg frosted-glass focus-visible:outline-none focus-visible:ring-zinc-300 dark:focus-visible:ring-zinc-100 hover:ring-zinc-300 dark:hover:ring-zinc-100 h-12 flex items-center justify-center text-zinc-800 dark:text-zinc-100"
                      >
                        Keep Editing
                      </button>
                      <button
                        type="button"
                        onClick={handleConfirmCancel}
                        className="flex-1 rounded-lg bg-red-500 hover:bg-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 h-12 flex items-center justify-center text-white"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </Dialog.Root>
  )
} 