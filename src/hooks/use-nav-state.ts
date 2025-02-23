import { useSearchParams } from "next/navigation"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { useToast } from "@/app/components/toast"

/**
 * Used to track navigation state. Call startNavigating()
 * to begin a "loading" state. Once the navigation is complete,
 * the loading state will reset.
 * 
 * Currently only works when the pathname or search params change.
 * 
 * @returns [isNavigating, startNavigating]
 */
export function useNavigationState(): [boolean, () => void] {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isNavigating, setIsNavigating] = useState(false)
  const { show } = useToast()
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timeout.current) {
      clearTimeout(timeout.current)
      timeout.current = null
    }
    setIsNavigating(false)
  }, [pathname, searchParams])

  useEffect(() => {
    if (!isNavigating) return
    /** Timeout in case of SSR issues */
    timeout.current = setTimeout(() => {
      show({
        message: 'There was an issue loading this project\'s details. Please try again.',
        type: 'error',
      })
      setIsNavigating(false)
    }, 5000)
  }, [isNavigating])

  const startNavigating = () => {
    setIsNavigating(true)
  }

  return [isNavigating, startNavigating]
}
