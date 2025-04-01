'use server'

import webpush, { PushSubscription as WebPushSubscription } from 'web-push'

// Set VAPID details - in production, these should be in your environment variables
// Generate keys with: npx web-push generate-vapid-keys
webpush.setVapidDetails(
  'mailto:contact@example.com', // Change to a real contact email
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '',
  process.env.VAPID_PRIVATE_KEY || ''
)

// In a real app, you would store subscriptions in a database
const subscriptions = new Map<string, WebPushSubscription>()

export async function subscribeUser(subscription: PushSubscription, userId: string) {
  // Store the subscription with the user ID as the key
  // Convert browser PushSubscription to WebPushSubscription type
  const webPushSubscription = subscription.toJSON() as unknown as WebPushSubscription
  subscriptions.set(userId, webPushSubscription)
  return { success: true }
}

export async function unsubscribeUser(userId: string) {
  // Remove the subscription for this user
  subscriptions.delete(userId)
  return { success: true }
}

export async function sendNotification(userId: string, message: string) {
  const subscription = subscriptions.get(userId)
  
  if (!subscription) {
    return { success: false, error: 'No subscription found for this user' }
  }
  
  try {
    await webpush.sendNotification(
      subscription,
      JSON.stringify({
        title: 'Parkbeat',
        body: message,
        icon: '/icon-192x192.png',
      })
    )
    return { success: true }
  } catch (error) {
    console.error('Error sending push notification:', error)
    return { success: false, error: 'Failed to send notification' }
  }
} 