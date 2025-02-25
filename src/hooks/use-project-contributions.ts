"use client"

import { useState } from 'react'
import { WebSocketManager } from './websocket-manager'
import { ContributionType } from '@/server/types/shared'

type AddContributionParams = {
  id: string
  project_id: string
  user_id: string
  contribution_type: ContributionType
  amount_cents?: number
  message?: string
}

type UseProjectContributionsReturn = {
  addContribution: (params: AddContributionParams) => Promise<void>
  isSubmitting: boolean
  error: Error | null
}

/**
 * Hook for managing project contributions
 * @returns Functions and state for adding contributions to projects
 */
export function useProjectContributions(): UseProjectContributionsReturn {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  
  /**
   * Add a contribution to a project
   * @param params Contribution parameters
   */
  const addContribution = async (params: AddContributionParams): Promise<void> => {
    setIsSubmitting(true)
    setError(null)
    
    try {
      const wsManager = WebSocketManager.getInstance()
      
      // Make sure we're connected
      if (wsManager.getConnectionState() !== 'connected') {
        await new Promise<void>((resolve) => {
          const checkConnection = () => {
            if (wsManager.getConnectionState() === 'connected') {
              resolve()
            } else {
              setTimeout(checkConnection, 100)
            }
          }
          checkConnection()
        })
      }
      
      // Emit the addContribution event
      wsManager.emit('addContribution', params)
      
      // Wait for the project data to be updated
      await new Promise<void>((resolve) => {
        // We'll resolve after a short delay since the server will emit updated project data
        // which will be handled by the useProjectData hook
        setTimeout(resolve, 500)
      })
      
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to add contribution'))
      console.error('Error adding contribution:', err)
    } finally {
      setIsSubmitting(false)
    }
  }
  
  return {
    addContribution,
    isSubmitting,
    error
  }
}
