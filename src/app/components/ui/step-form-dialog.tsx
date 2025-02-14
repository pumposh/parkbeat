import * as Dialog from '@radix-ui/react-dialog'
import { useState, useRef, useEffect, useLayoutEffect, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

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
  isDeleting?: boolean
}

interface StepFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  steps: {
    title: string
    content: ReactNode
  }[]
  currentStep: number
  onStepChange?: (step: number) => void
  onClose?: () => void
  onCancel?: () => void
  onSubmit?: () => void
  isSubmitting?: boolean
  canSubmit?: boolean
  cancelConfirmation?: CancelConfirmation
  cancelAction?: CancelAction
}

interface StepState {
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
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward')
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [activeSteps, setActiveSteps] = useState<StepState[]>([])
  const [contentHeight, setContentHeight] = useState<number>(0)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const resizeObserver = useRef<ResizeObserver | null>(null)
  const stepRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  
  if (!currentStepData) {
    return null
  }

  // Initialize active steps
  useLayoutEffect(() => {
    if (activeSteps.length === 0 && open) {
      const initialStep: StepState = {
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
    setContentHeight(height)

    // Create observer to watch content height changes
    resizeObserver.current = new ResizeObserver(entries => {
      for (const entry of entries) {
        // Get the first element with actual content height
        const contentElement = Array.from(entry.target.children).find(
          child => child instanceof HTMLElement && child.offsetHeight > 0
        )
        if (contentElement instanceof HTMLElement) {
          const height = contentElement.getBoundingClientRect().height
          setContentHeight(height)
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
          className="dialog-content fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl p-4 overflow-visible"
          aria-describedby="step-form-dialog-description"
        >
          <div className="pointer-events-auto">
            <div className="frosted-glass rounded-2xl relative grid grid-rows-[auto_1fr_auto] overflow-hidden">
              <div className={cn(
                "p-8 pb-0 space-y-2 transition-opacity duration-300",
              )}>
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
                className="relative overflow-hidden transition-[height] duration-300 ease-in-out"
                style={{
                  height: `calc(${contentHeight}px + 2rem)` || 'auto',
                  minHeight: '200px',
                }}
              >
                <div ref={contentRef} className="StepFormDialog__content-wrapper h-auto w-auto px-8 py-4" style={{
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

              <div className="p-8 pt-0 flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (currentStep > 0) {
                      handleStepChange(currentStep - 1)
                    } else {
                      handleCancel()
                    }
                  }}
                  disabled={isSubmitting || isTransitioning}
                  className="flex-1 rounded-lg frosted-glass focus-visible:outline-none focus-visible:ring-zinc-300 dark:focus-visible:ring-zinc-100 hover:ring-zinc-300 dark:hover:ring-zinc-100 h-12 flex items-center justify-center text-zinc-800 dark:text-zinc-100 text-xl disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={currentStep > 0 ? "Previous step" : "Close"}
                >
                  <i 
                    className={cn(
                      "fa-solid",
                      currentStep > 0 ? "fa-arrow-left" : "fa-xmark",
                      "transition-opacity"
                    )} 
                    aria-hidden="true" 
                  />
                </button>
                {isLastStep ? (
                  <button
                    type="button"
                    onClick={onSubmit}
                    disabled={isSubmitting || !canSubmit || isTransitioning}
                    className="flex-1 rounded-lg bg-emerald-500 hover:bg-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 h-12 flex items-center justify-center text-white text-xl disabled:cursor-not-allowed disabled:bg-emerald-500/50"
                    aria-label="Submit"
                  >
                    <i 
                      className={cn(
                        "fa-solid",
                        isSubmitting ? "fa-circle-notch fa-spin" : "fa-check",
                        "transition-opacity"
                      )} 
                      aria-hidden="true" 
                    />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleStepChange(currentStep + 1)}
                    disabled={isSubmitting || isTransitioning}
                    className="flex-1 rounded-lg bg-emerald-500 hover:bg-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 h-12 flex items-center justify-center text-white text-xl disabled:cursor-not-allowed disabled:bg-emerald-500/50"
                    aria-label="Next step"
                  >
                    <i className="fa-solid fa-arrow-right transition-opacity" aria-hidden="true" />
                  </button>
                )}
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
                        onClick={handleConfirmCancel}
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