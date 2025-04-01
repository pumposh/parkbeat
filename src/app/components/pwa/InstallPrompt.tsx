'use client'

import { useEffect, useState, useRef } from 'react'
import { useToast } from '@/app/components/toast'

// Local storage keys for tracking prompts
const IOS_PROMPT_KEY = 'parkbeat-ios-install-prompted'
const INSTALL_PROMPT_KEY = 'parkbeat-install-prompted'

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const toast = useToast()
  const iOSPromptShown = useRef(false)
  const installPromptShown = useRef(false)
  
  // Check if a prompt has been shown before
  const hasPromptBeenShown = (key: string): boolean => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(key) === 'true'
  }
  
  // Mark a prompt as shown
  const markPromptAsShown = (key: string): void => {
    if (typeof window === 'undefined') return
    localStorage.setItem(key, 'true')
  }
  
  useEffect(() => {
    // Check if it's iOS and not already installed
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).navigator.standalone
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    
    // Check local storage first to see if we've prompted before
    const hasShownIOSPrompt = hasPromptBeenShown(IOS_PROMPT_KEY)
    
    // Only show iOS toast if we haven't shown it in this session and never shown it before
    if (isIOS && !isStandalone && !iOSPromptShown.current && !hasShownIOSPrompt) {
      iOSPromptShown.current = true
      markPromptAsShown(IOS_PROMPT_KEY)
      
      // Show iOS installation toast
      toast.show({
        message: 'Install this app on your iPhone: tap Share icon and then "Add to Home Screen"',
        type: 'info',
        persistent: true,
        duration: 10000,
        position: 'bottom'
      })
    }

    // Listen for the beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault()
      // Stash the event so it can be triggered later
      setDeferredPrompt(e)
      
      // Check local storage to see if we've prompted for install before
      const hasShownInstallPrompt = hasPromptBeenShown(INSTALL_PROMPT_KEY)
      
      // Only show install toast if we haven't shown it in this session and never shown it before
      if (!installPromptShown.current && !hasShownInstallPrompt) {
        installPromptShown.current = true
        markPromptAsShown(INSTALL_PROMPT_KEY)
        
        // Show install toast
        toast.show({
          message: 'Install Parkbeat for a better experience and offline access',
          type: 'info',
          persistent: true,
          actionLabel: 'Install App',
          onAction: () => handleInstallClick()
        })
      }
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

    // Listen for app installed event
    const handleAppInstalled = () => {
      // Reset the prompt
      setDeferredPrompt(null)
      installPromptShown.current = false
      
      // Show success toast
      toast.show({
        message: 'Parkbeat has been successfully installed',
        type: 'success',
        duration: 3000
      })
    }

    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [toast])

  const handleInstallClick = async () => {
    if (!deferredPrompt) return
    
    try {
      // Show the install prompt
      deferredPrompt.prompt()
      
      // Wait for the user to respond to the prompt
      const { outcome } = await deferredPrompt.userChoice
      
      // We no longer need the prompt
      setDeferredPrompt(null)
      installPromptShown.current = false
      
      // Show toast based on outcome
      if (outcome === 'accepted') {
        toast.show({
          message: 'Installing Parkbeat...',
          type: 'info',
          duration: 2000
        })
      }
    } catch (error) {
      console.error('Error showing install prompt:', error)
    }
  }

  // Return null since we're using toasts instead of custom UI
  return null
} 