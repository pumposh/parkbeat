'use client'

/**
 * Custom hook for validating Google Street View images before using them in a community project.
 * This hook provides functionality to:
 * 1. Validate if a street view location is suitable for a community project
 * 2. Handle quirky rejection messages when a location is unsuitable
 * 3. Manage loading states during validation
 * 4. Provide error handling and success callbacks
 */

import { useState, useEffect, useRef } from 'react'
import { useToast } from '@/app/components/toast'
import { WebSocketManager } from './websocket-manager'
import { useServerEvent } from './websocket-manager'
import { generateId } from '@/lib/id'
import { HydratableDate } from '@/lib/utils'

// Validation error types
export interface ValidationError {
  code: string
  message: string
  details?: any
  type?: string
  path?: string[]
  timestamp?: string
  requestId?: string
}

// Street view parameters
export interface StreetViewParams {
  lat: number
  lng: number
  heading: number
  pitch: number
  zoom: number
}

// Image source parameters
export type ImageSourceParams = 
  | { type: 'url'; url: string }
  | { type: 'streetView'; params: StreetViewParams }

// Validation options
export interface ValidationOptions {
  projectId?: string
  fundraiserId?: string
  onSuccess?: (response: ValidationSuccess) => void
  onError?: (error: ValidationError) => void
}

// Add success response type
interface ValidationSuccess {
  success: 'yes' | 'no' | 'maybe'
  description: string
  imageUrl: string
  requestId: string
  params?: {
    lat: number
    lng: number
    heading: number
    pitch: number
    zoom: number
  }
}

// Type guard for validation errors
function isValidationError(value: any): value is ValidationError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    'message' in value
  )
}

// Utility function to format error messages
function formatErrorMessage(error: ValidationError): string {
  if (error.type === 'invalid_input') {
    return error.message // Return quirky message as is
  }

  // Format different error types appropriately
  switch (error.code) {
    case 'MISSING_API_KEYS':
      return 'System configuration error. Please contact support.'
    case 'INVALID_IMAGE_SOURCE':
      return 'Unable to capture street view at this location.'
    case 'AI_VALIDATION_FAILED':
      return 'Unable to analyze the street view. Please try again.'
    case 'DB_ERROR':
      return 'Failed to save the validation result. Please try again.'
    case 'NETWORK_ERROR':
      return 'Network connection error. Please check your connection.'
    case 'API_ERROR':
      return 'Service temporarily unavailable. Please try again later.'
    default:
      return error.message || 'An unexpected error occurred'
  }
}

/**
 * Hook for validating street view images
 * @param options Configuration options for validation
 * @returns Object containing validation function and loading state
 * 
 * Usage:
 * const { validateStreetView, isValidating } = useStreetViewValidation({
 *   projectId: 'project-123',
 *   fundraiserId: 'user-456',
 *   onSuccess: (response) => console.log('Validation successful', response),
 *   onError: (error) => console.error('Validation failed', error)
 * });
 */
export function useStreetViewValidation(defaultOptions: ValidationOptions = {}) {
  const [isValidating, setIsValidating] = useState(false)
  const { show } = useToast()
  const wsManager = WebSocketManager.getInstance()
  const request = useRef({
    options: defaultOptions,
    requestId: ''
  })

  const [imageValidation] = useServerEvent.imageValidation({
    projectId: '',
    requestId: request.current.requestId,
    result: {
      isValid: false,
      isMaybe: false,
      description: '',
    }
  })

  // Handle WebSocket validation response
  useEffect(() => {
    if (!imageValidation || !imageValidation.projectId) return
    console.log('[StreetViewValidation] imageValidation', imageValidation)
    if (imageValidation.requestId === request.current.requestId) return
    
    const { result, projectId } = imageValidation
    const options = {
      ...defaultOptions,
      ...request.current.options,
    }
    request.current = {
      ...request.current,
      requestId: imageValidation.requestId
    }
    
    if (result.error) {
      const error: ValidationError = {
        code: result.error.code,
        message: result.error.message,
        details: result.error.details,
        timestamp: new HydratableDate().toISOString()
      }
      handleError(error, options)
      setIsValidating(false)
      return
    }

    // Handle success
    const successResponse: ValidationSuccess = {
      success: result.isMaybe ? 'maybe' : result.isValid ? 'yes' : 'no',
      description: result.description,
      imageUrl: '', // This will be set by the validateStreetView function
      requestId: projectId,
    }

    options.onSuccess?.(successResponse)
    setIsValidating(false)
  }, [imageValidation, defaultOptions])

  // Centralized error handling
  const handleError = (error: ValidationError, options?: Partial<ValidationOptions>) => {
    console.error('[StreetViewValidation] Error:', {
      ...error,
      timestamp: error.timestamp || new Date().toISOString()
    })

    // Call the error callback
    if (options?.onError) {
      options.onError(error)
    } else if (error.type !== 'invalid_input') {
      show({
        message: formatErrorMessage(error),
        type: 'error',
        duration: 3000
      })
    }
  }

  const validateStreetView = async (
    params: StreetViewParams | ImageSourceParams,
    overrideOptions?: Partial<ValidationOptions>
  ) => {
    // Merge default options with any overrides
    const options = { ...defaultOptions, ...overrideOptions }

    try {
      setIsValidating(true)
      console.log('[StreetViewValidation] Starting validation with params:', {
        params,
        projectId: options.projectId,
        fundraiserId: options.fundraiserId
      })

      if (!options.projectId || !options.fundraiserId) {
        throw new Error('Project ID and Fundraiser ID are required')
      }

      const newRequestId = generateId()

      request.current = {
        ...request.current,
        options,
      }

      wsManager.emit('validateImage', {
        imageSource: 'type' in params ? params : {
          type: 'streetView',
          params
        },
        projectId: options.projectId,
        fundraiserId: options.fundraiserId,
        requestId: newRequestId
      }, {
        timing: 'immediate'
      })

      return true
    } catch (error) {
      const validationError: ValidationError = {
        code: 'UNKNOWN_ERROR',
        message: error instanceof Error ? error.message : 'An unexpected error occurred',
        details: error,
        timestamp: new Date().toISOString()
      }
      handleError(validationError, options)
      setIsValidating(false)
      return false
    }
  }

  return {
    validateStreetView,
    isValidating
  }
} 