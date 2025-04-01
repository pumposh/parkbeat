'use client'

import { useEffect, useState, useRef } from 'react'
import { useUser } from '@clerk/nextjs'
import { subscribeUser, unsubscribeUser } from '@/app/actions'
import { useToast } from '@/app/components/toast'

// Local storage key for tracking notification prompt
const NOTIFICATION_PROMPT_KEY = 'parkbeat-notifications-prompted'

export default function PushNotificationManager() {
  const { user, isSignedIn } = useUser()
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null)
  const [permission, setPermission] = useState<NotificationPermission | null>(null)
  const toast = useToast()
  const notificationPromptShown = useRef(false)

  // Check if browser supports notifications
  const notificationSupported = typeof window !== 'undefined' && 'Notification' in window
  
  // Check if a prompt has been shown before
  const hasPromptBeenShown = (): boolean => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(NOTIFICATION_PROMPT_KEY) === 'true'
  }
  
  // Mark a prompt as shown
  const markPromptAsShown = (): void => {
    if (typeof window === 'undefined') return
    localStorage.setItem(NOTIFICATION_PROMPT_KEY, 'true')
  }

  useEffect(() => {
    // Skip if notifications not supported or user not signed in
    if (!notificationSupported || !isSignedIn) return
    
    // Check notification permission on component mount
    const currentPermission = Notification.permission
    setPermission(currentPermission)

    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => {
          setRegistration(reg)
          // Check if already subscribed
          return reg.pushManager.getSubscription()
        })
        .then(subscription => {
          if (subscription) {
            setIsSubscribed(true)
          } else if (currentPermission !== 'denied') {
            // Only show prompt if not already subscribed and not denied
            const hasShownPrompt = hasPromptBeenShown()
            if (!notificationPromptShown.current && !hasShownPrompt) {
              notificationPromptShown.current = true
              markPromptAsShown()
              
              // Show notification permission toast
              toast.show({
                message: 'Get notified about what\'s happening in your area',
                type: 'info',
                persistent: true,
                position: 'bottom',
                actionLabel: 'Enable Notifications',
                onAction: () => handleSubscribe()
              })
            }
          }
        })
        .catch(error => console.error('Service worker registration failed:', error))
    }
  }, [notificationSupported, isSignedIn, toast])

  const handleSubscribe = async () => {
    if (!registration || !isSignedIn || !user) return

    try {
      // Request notification permission if needed
      if (Notification.permission !== 'granted') {
        const newPermission = await Notification.requestPermission()
        setPermission(newPermission)
        
        if (newPermission !== 'granted') {
          toast.show({
            message: 'Notification permission denied',
            type: 'error',
            duration: 3000
          })
          return
        }
      }

      // Get the VAPID public key from environment
      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
      
      // Subscribe to push notifications
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
      })

      // Save subscription on server
      await subscribeUser(subscription, user.id)
      setIsSubscribed(true)
      
      // Show success toast
      toast.show({
        message: 'Notifications enabled successfully',
        type: 'success',
        duration: 3000
      })
    } catch (error) {
      console.error('Failed to subscribe to push notifications:', error)
      toast.show({
        message: 'Failed to enable notifications',
        type: 'error',
        duration: 3000
      })
    }
  }

  const handleUnsubscribe = async () => {
    if (!registration || !isSignedIn || !user) return

    try {
      // Get current subscription
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        // Unsubscribe
        await subscription.unsubscribe()
        // Update server
        await unsubscribeUser(user.id)
        setIsSubscribed(false)
        
        // Show notification
        toast.show({
          message: 'Notifications disabled',
          type: 'info',
          duration: 3000
        })
      }
    } catch (error) {
      console.error('Failed to unsubscribe from push notifications:', error)
      toast.show({
        message: 'Failed to disable notifications',
        type: 'error',
        duration: 3000
      })
    }
  }

  // For already subscribed users, offer an unsubscribe option via toast
  useEffect(() => {
    if (isSubscribed && isSignedIn) {
      // Add settings button to manage notifications
      const settingsTimeout = setTimeout(() => {
        toast.show({
          message: 'You are receiving notifications from Parkbeat',
          type: 'info',
          persistent: true,
          actionLabel: 'Disable',
          onAction: () => handleUnsubscribe()
        })
      }, 5000) // Show after a delay to avoid too many toasts at once
      
      return () => {
        clearTimeout(settingsTimeout)
      }
    }
  }, [isSubscribed, isSignedIn, toast])

  // No UI is rendered directly - everything is handled through toasts
  return null
}

// Utility function to convert base64 to Uint8Array
// Required for the applicationServerKey
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/')

  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  
  return outputArray
} 