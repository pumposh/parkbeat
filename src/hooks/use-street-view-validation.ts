/**
 * Custom hook for validating Google Street View images before using them in a community project.
 * This hook provides functionality to:
 * 1. Validate if a street view location is suitable for a community project
 * 2. Handle quirky rejection messages when a location is unsuitable
 * 3. Manage loading states during validation
 * 4. Provide error handling and success callbacks
 */

import { useState } from 'react'
import { useToast } from '@/app/components/toast'
import { client } from '@/lib/client'

// Parameters required for street view validation
interface StreetViewParams {
  lat: number
  lng: number
  heading: number
  pitch: number
  zoom: number
}

// Enhanced error interface to match backend
interface ValidationError {
  code: string
  message: string
  details?: any
  type?: string
  path?: string[]
  cause?: Error | unknown
  timestamp?: string
  requestId?: string
}

const isValidationError = (error: any): error is ValidationError => {
  return typeof error === 'object' && error !== null && 'code' in error && 'message' in error
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

// Options for configuring the validation process
interface ValidationOptions {
  projectId?: string
  fundraiserId?: string
  onSuccess?: (response: ValidationSuccess) => void
  onError?: (error: ValidationError) => void
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

// Utility function to parse error response
function parseErrorResponse(response: any, status: number): ValidationError {
  // Helper to try parsing a string as JSON
  const tryParseJson = (str: string) => {
    let parsed;
    try {
      parsed = JSON.parse(str);
      if (typeof parsed === 'object' && parsed !== null && 'message' in parsed) {
        
      }
    } catch (e) {
      parsed = str;
    }
    return parsed;
  }

  // If it's already a validation error, return it
  if (isValidationError(response)) {
    return response
  }

  // Handle case where the error is wrapped multiple times
  if (typeof response === 'object' && response !== null) {
    // First try the message field
    if ('message' in response) {
      const parsedMessage = typeof response.message === 'string'
        ? tryParseJson(response.message)
        : response.message

      if (isValidationError(parsedMessage)) {
        return parsedMessage
      }
    }

    // Then try the details field
    if ('details' in response) {
      const details = response.details
      if (typeof details === 'object' && details !== null && 'message' in details) {
        const parsedDetails = typeof details.message === 'string'
          ? tryParseJson(details.message)
          : details.message

        if (isValidationError(parsedDetails)) {
          return parsedDetails
        }
      }
    }
  }

  // Fallback error
  return {
    code: `HTTP_${status}`,
    message: response?.message?.toString() || 'Request failed',
    details: response,
    timestamp: new Date().toISOString(),
    requestId: response?.requestId
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

  // Centralized error handling
  const handleError = (error: ValidationError, options?: Partial<ValidationOptions>) => {
    console.error('[StreetViewValidation] Error:', {
      ...error,
      timestamp: error.timestamp || new Date().toISOString()
    })

    // Call the error callback
    if (options?.onError) {
      options.onError(error)
    }

    // Only show toast for non-validation errors (since we handle those in the UI)
    if (error.type !== 'invalid_input') {
      show({
        message: formatErrorMessage(error),
        type: 'error',
        duration: 3000
      })
    }
  }

  const validateStreetView = async (
    params: StreetViewParams,
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

      const res = await client.ai.validateImage.$post({
        imageSource: {
          type: 'streetView',
          params
        },
        projectId: options.projectId || '',
        fundraiserId: options.fundraiserId || ''
      })

      console.log('[StreetViewValidation] Raw response status:', res.status)

      let response
      try {
        response = await res.json()
        console.log('[StreetViewValidation] Parsed response:', response)
      } catch (parseError) {
        const error: ValidationError = {
          code: 'PARSE_ERROR',
          message: 'Invalid response from server',
          details: parseError,
          timestamp: new Date().toISOString()
        }
        handleError(error, options)
        return false
      }

      // Handle error responses
      if (!res.ok || isValidationError(response)) {
        const error = parseErrorResponse(response, res.status)
        handleError(error, options)
        return false
      }

      // Handle success
      console.log('[StreetViewValidation] Validation successful:', {
        response,
        requestId: response.requestId
      })
      
      const successResponse: ValidationSuccess = {
        ...response,
        params: {
          ...params,
          lat: params.lat,
          lng: params.lng,
          heading: params.heading,
          pitch: params.pitch,
          zoom: params.zoom
        }
      }
      
      options.onSuccess?.(successResponse)
      return true

    } catch (error) {
      const parsedError = parseErrorResponse(error, 400)
      if (isValidationError(parsedError)) {
        handleError(parsedError, options)
        return false
      }
      
      const validationError: ValidationError = {
        code: 'UNKNOWN_ERROR',
        message: error instanceof Error ? error.message : 'An unexpected error occurred',
        details: error,
        timestamp: new Date().toISOString()
      }
      handleError(validationError, options)
      return false
    } finally {
      setIsValidating(false)
    }
  }

  return {
    validateStreetView,
    isValidating
  }
} 