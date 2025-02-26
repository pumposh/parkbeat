'use client'

import { useState, useRef, useEffect } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useAuth } from '@clerk/nextjs'
import { useProjectContributions } from '@/hooks/use-project-contributions'
import { ContributionType } from '@/server/types/shared'
import { cn } from '@/lib/utils'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { generateId } from '@/lib/id'
import { isNullish } from '@/lib/nullable'
import { asyncTimeout } from '@/lib/async'

// Toast notification implementation
const toast = {
  error: (message: string) => {
    console.error(message)
    // In a real implementation, you would show a toast notification
  },
  success: (message: string) => {
    console.log(message)
    // In a real implementation, you would show a toast notification
  }
}

// Custom styles for this specific dialog
const contributionDialogStyles = `
  .contribution-dialog-overlay[data-state="open"],
  .contribution-dialog-overlay[data-state="closed"],
  .contribution-dialog-content {
    background-color: transparent !important;
    backdrop-filter: none !important;
    animation: none !important;
  }
  
  .content-transition {
    transition: height 150ms ease-in-out;
  }
  
  /* Mobile positioning fixes */
  @media (max-width: 768px) {
    .contribution-dialog-content {
      position: fixed;
      top: 40% !important; /* Position higher on mobile to avoid keyboard issues */
      max-height: 80vh;
      transform: translate(-50%, -40%) !important;
    }
  }
`;

interface ContributionDialogProps {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
  targetMet?: boolean
}

export function ContributionDialog({ projectId, open, onOpenChange, onSuccess, targetMet = false }: ContributionDialogProps) {
  const { userId } = useAuth()
  const { addContribution } = useProjectContributions()
  
  const [amount, setAmount] = useState<string>('')
  const [showAmountInput, setShowAmountInput] = useState(false)
  const [message, setMessage] = useState<string>('')
  const [contributionType, setContributionType] = useState<ContributionType>('social')
  const [contentHeight, setContentHeight] = useState<number>(0)
  const [isHeightTransitioning, setIsHeightTransitioning] = useState(false)
  const [id, setId] = useState<string>(generateId())
  const contentRef = useRef<HTMLDivElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const messageInputRef = useRef<HTMLInputElement>(null)
  const amountInputRef = useRef<HTMLInputElement>(null)

  const [isDisabled, setIsDisabled] = useState(true)

  // Focus input after dialog opens with a delay
  useEffect(() => {
    if (open) {
      setIsDisabled(true)
      // Explicitly blur any focused inputs first
      amountInputRef.current?.blur()
      messageInputRef.current?.blur()
      
      // Set a timeout to focus the input after the dialog animation completes
      const focusTimer = setTimeout(async () => {
        setIsDisabled(false)
        await asyncTimeout(300)
        if (showAmountInput && amountInputRef.current) {
          amountInputRef.current.focus();
        } else if (messageInputRef.current) {
          messageInputRef.current.focus();
        }
      }, 300); // 300ms delay to allow the dialog animation to complete
      
      return () => clearTimeout(focusTimer);
    }
  }, [open, showAmountInput]);

  useEffect(() => {
    if (isNullish(formRef.current)) return;
    const height = formRef.current.getBoundingClientRect().height;
    setContentHeight(height);
  }, [formRef])
  
  // Handle height animation when switching between modes
  useEffect(() => {
    if (!formRef.current) return;
    
    // Set transitioning state
    setIsHeightTransitioning(true);
    
    // Measure the new height
    const height = formRef.current.getBoundingClientRect().height;
    setContentHeight(height);
    
    // Clear transitioning state after animation completes
    const timer = setTimeout(() => {
      setIsHeightTransitioning(false);
    }, 300); // Match the transition duration in CSS
    
    return () => clearTimeout(timer);
  }, [showAmountInput]);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!userId) {
      toast.error('You must be logged in to contribute')
      return
    }
    
    try {
      await addContribution({
        id,
        project_id: projectId,
        user_id: userId,
        contribution_type: contributionType,
        amount_cents: contributionType === 'funding' ? Math.round(parseFloat(amount) * 100) : undefined,
        message: message.trim() || undefined
      })
      setId(generateId())
      
      // Reset form
      setAmount('')
      setMessage('')
      setContributionType('social')
      setShowAmountInput(false)
      
      // Show success message
      toast.success('Contribution added successfully!')
      
      // Close dialog
      onOpenChange(false)
      
      // Call onSuccess callback if provided
      if (onSuccess) {
        onSuccess()
      }
    } catch (err) {
      toast.error('Failed to add contribution')
      console.error('Error submitting contribution:', err)
    }
  }

  const handleFinancialClick = () => {
    setContributionType('funding')
    setShowAmountInput(true)
  }

  const handleSocialClick = () => {
    if (message.trim() === '') {
      toast.error('Please enter a message')
      return
    }
    
    setContributionType('social')
    handleSubmit(new Event('submit') as any)
  }
  
  const handleCancelFinancial = () => {
    setShowAmountInput(false)
    setContributionType('social')
  }
  
  const handleFinancialSubmit = () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast.error('Please enter a valid amount')
      return
    }
    
    setContributionType('funding')
    handleSubmit(new Event('submit') as any)
  }
  
  return (
    <>
      <style jsx global>{contributionDialogStyles}</style>
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="contribution-dialog-overlay dialog-overlay fixed inset-0 bg-transparent" />
          <Dialog.Content className="dialog-content fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md overflow-visible">
            <div className="pointer-events-auto flex flex-col flex-1 overflow-hidden">
              <div className="frosted-glass rounded-2xl relative overflow-hidden p-0">
                <VisuallyHidden>
                  <Dialog.Title>Support This Project</Dialog.Title>
                  <Dialog.Description>
                    Show your support by contributing financially or with a message of encouragement.
                  </Dialog.Description>
                </VisuallyHidden>
                
                <div 
                  ref={contentRef} 
                  className={cn(
                    "content-transition p-4 flex flex-col",
                    isHeightTransitioning && "overflow-hidden"
                  )}
                  style={{ height: contentHeight > 0 ? `${contentHeight + 32}px` : 'auto' }}
                >
                  <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
                    <div className="relative">
                      <div className="w-full">
                        <VisuallyHidden>
                          <label htmlFor="message">Message</label>
                        </VisuallyHidden>
                        <input 
                          id="message"
                          ref={messageInputRef}
                          disabled={isDisabled}
                          type="text"
                          value={message}
                          onChange={(e) => setMessage(e.target.value)}
                          placeholder="Write a message"
                          className={cn(
                            "flex h-12 mx-1 mb-1 w-full rounded-full border border-input bg-background px-3 py-2 text-base ring-offset-background",
                            "placeholder:text-muted-foreground",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          )}
                        />
                      </div>
                    </div>
                    
                    {showAmountInput && (
                      <div className="mt-2 animate-fadeIn">
                        <div className="relative w-full">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                          <input 
                            id="amount"
                            ref={amountInputRef}
                            disabled={isDisabled}
                            type="number"
                            min="1"
                            step="0.01"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            placeholder="[Will not charge]"
                            required
                            className={cn(
                              "flex mx-1 my-1 h-12 w-full rounded-full border border-input bg-background pl-8 pr-3 py-2 text-base ring-offset-background",
                              "placeholder:text-muted-foreground",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            )}
                          />
                        </div>
                      </div>
                    )}
                  </form>
                </div>
                
                {/* Buttons positioned at bottom right */}
                <div className="absolute bottom-5 right-3 flex items-center gap-2">
                  {!showAmountInput ? (
                    <>
                      <button 
                        type="button" 
                        onClick={handleSocialClick}
                        disabled={!message.trim()}
                        className="inline-flex items-center justify-center rounded-full w-12 h-12 bg-primary dark:text-white hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none"
                      >
                        <i className="fa-solid fa-paper-plane text-lg"></i>
                        <VisuallyHidden>Send Social Support</VisuallyHidden>
                      </button>
                      {!targetMet && <button 
                        type="button" 
                        onClick={handleFinancialClick}
                        className={cn(
                          "inline-flex items-center justify-center rounded-full w-12 h-12 text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                          targetMet 
                            ? "bg-gray-400 cursor-not-allowed" 
                            : "bg-green-500 hover:bg-green-600"
                        )}
                      >
                        <i className="fa-solid fa-dollar-sign text-lg"></i>
                        <VisuallyHidden>Financial Support</VisuallyHidden>
                      </button>}
                    </>
                  ) : (
                    <>
                      <button 
                        type="button" 
                        onClick={handleCancelFinancial}
                        className="inline-flex items-center justify-center rounded-full w-12 h-12 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        <i className="fa-solid fa-xmark text-lg"></i>
                        <VisuallyHidden>Cancel</VisuallyHidden>
                      </button>
                      <button 
                        type="button" 
                        onClick={handleFinancialSubmit}
                        disabled={!amount || parseFloat(amount) <= 0}
                        className="inline-flex items-center justify-center rounded-full w-12 h-12 bg-green-500 text-white hover:bg-green-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none"
                      >
                        <i className="fa-solid fa-check text-lg"></i>
                        <VisuallyHidden>Confirm</VisuallyHidden>
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
} 