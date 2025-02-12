import * as Toast from '@radix-ui/react-toast'
import { cn } from '@/lib/utils'
import { useState, useCallback } from 'react'

interface ToastProps {
  title?: string
  description?: string
  type?: 'success' | 'error' | 'info'
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function ParkbeatToast({
  title,
  description,
  type = 'info',
  open,
  onOpenChange
}: ToastProps) {
  return (
    <Toast.Provider>
      <Toast.Root
        className={cn(
          "frosted-glass",
          "fixed bottom-4 right-4 z-50",
          "flex items-center gap-3 px-6 py-4 rounded-lg",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          "data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-right-full",
          "data-[swipe=cancel]:translate-x-0 data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)]",
          "data-[swipe=cancel]:transition-[transform_200ms_ease-out] data-[swipe=end]:animate-out data-[swipe=end]:fade-out data-[swipe=end]:slide-out-to-right-full",
        )}
        open={open}
        onOpenChange={onOpenChange}
      >
        <div className="flex items-center gap-3">
          {type === 'success' && (
            <i className="fa-solid fa-check text-green-500 dark:text-green-400" aria-hidden="true" />
          )}
          {type === 'error' && (
            <i className="fa-solid fa-xmark text-red-500 dark:text-red-400" aria-hidden="true" />
          )}
          {type === 'info' && (
            <i className="fa-solid fa-info text-blue-500 dark:text-blue-400" aria-hidden="true" />
          )}
          <div className="flex flex-col gap-1">
            {title && (
              <Toast.Title className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                {title}
              </Toast.Title>
            )}
            {description && (
              <Toast.Description className="text-sm text-zinc-600 dark:text-zinc-400">
                {description}
              </Toast.Description>
            )}
          </div>
        </div>
        <Toast.Close className="absolute top-2 right-2 p-1 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800">
          <i className="fa-solid fa-xmark text-sm text-zinc-500 dark:text-zinc-400" aria-hidden="true" />
        </Toast.Close>
      </Toast.Root>
      <Toast.Viewport />
    </Toast.Provider>
  )
}

// Hook to manage toast state
export function useToast() {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<Omit<ToastProps, 'open' | 'onOpenChange'>>({})

  const show = useCallback((props: Omit<ToastProps, 'open' | 'onOpenChange'>) => {
    setData(props)
    setOpen(true)
  }, [])

  return {
    Toast: (
      <ParkbeatToast
        {...data}
        open={open}
        onOpenChange={setOpen}
      />
    ),
    show
  }
} 