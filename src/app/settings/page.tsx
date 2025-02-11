'use client'

import { useEffect } from 'react'

export default function SettingsPage() {
  useEffect(() => {
    // Create and dispatch a custom event to open the dialog
    const event = new CustomEvent('openSettings')
    window.dispatchEvent(event)
  }, [])

  return null
} 