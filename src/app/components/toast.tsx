import { useEffect, useState, createContext, useContext } from 'react'
import { createPortal } from 'react-dom'

type ToastProps = {
  message: string
  type?: 'success' | 'error' | 'info'
  duration?: number
  persistent?: boolean
  onClose: () => void
}

export function Toast({ message, type = 'info', duration = 3000, persistent = false, onClose }: ToastProps) {
  const [isVisible, setIsVisible] = useState(true)
  const [isMounted, setIsMounted] = useState(false)
  const [bottomOffset, setBottomOffset] = useState(16) // default 4rem

  useEffect(() => {
    setIsMounted(true)
    const footer = document.querySelector('.parkbeat-footer')
    if (footer) {
      const footerHeight = footer.getBoundingClientRect().height
      setBottomOffset(footerHeight + 8) // Add 16px padding above footer
    }

    if (!persistent) {
      const timer = setTimeout(() => {
        setIsVisible(false)
        setTimeout(onClose, 300) // Wait for fade out animation
      }, duration)
      return () => clearTimeout(timer)
    }
  }, [duration, onClose, persistent])

  if (!isMounted || typeof window === 'undefined') return null

  const icon = type === 'success' ? 'check-circle' : 
               type === 'error' ? 'circle-exclamation' : 
               'circle-info'

  const colorClass = type === 'success' ? 'text-emerald-500' :
                    type === 'error' ? 'text-red-500' :
                    'text-blue-500'

  const portal = document.createElement('div')
  portal.setAttribute('id', 'toast-portal')
  if (!document.getElementById('toast-portal')) {
    document.body.appendChild(portal)
  }

  return createPortal(
    <div 
      className={`
        frosted-glass fixed transition-all duration-300 ease-out z-50
        left-1/2 -translate-x-1/2
        md:left-auto md:right-4 md:-translate-x-0
        ${isVisible ? 'toast-enter' : 'toast-exit'}
      `}
      style={{ bottom: `${bottomOffset}px` }}
    >
      <div className="rounded-lg shadow-lg flex items-center gap-3 px-4 py-3 min-w-[320px] max-w-md">
        <i className={`fa-solid fa-${icon} text-lg ${colorClass}`} aria-hidden="true" />
        <p className="text-sm text-zinc-800 dark:text-zinc-200">{message}</p>
        {persistent && (
          <button
            onClick={() => {
              setIsVisible(false)
              setTimeout(onClose, 300)
            }}
            className="ml-auto text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            aria-label="Close"
          >
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>,
    document.getElementById('toast-portal') || document.body
  )
}

type ToastContextType = {
  show: (props: Omit<ToastProps, 'onClose'>) => void
}

export const ToastContext = createContext<ToastContextType>({
  show: () => {}
})

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Array<ToastProps & { id: string }>>([])

  const show = (props: Omit<ToastProps, 'onClose'>) => {
    const id = Math.random().toString(36).substring(7)
    setToasts(prev => [...prev, { ...props, id, onClose: () => {
      setToasts(prev => prev.filter(toast => toast.id !== id))
    }}])
  }

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toasts.map(toast => (
        <Toast key={toast.id} {...toast} />
      ))}
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext) 