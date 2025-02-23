// Core types shared across the backend

import { projectServerEvents } from "../routers/socket/project-handlers"
import { z } from "zod"
export type ProjectStatus = 'draft' | 'active' | 'funded' | 'completed' | 'archived'

export type ProjectCategory = 
  | 'urban_greening'
  | 'park_improvement'
  | 'community_garden'
  | 'playground'
  | 'public_art'
  | 'sustainability'
  | 'accessibility'
  | 'other'

export interface BaseProject {
  id: string
  name: string  
  description?: string
  status: ProjectStatus
  fundraiser_id: string
  _loc_lat: number
  _loc_lng: number
  _loc_geohash?: string
  _meta_created_by: string
  _meta_updated_at: string
  _meta_updated_by: string
  _meta_created_at: string
  _view_heading?: number
  _view_pitch?: number
  _view_zoom?: number
}

export interface ProjectSuggestion {
  id: string
  title: string
  summary: string | null
  description?: string
  imagePrompt: string
  category: ProjectCategory | string
  project_id: string
  fundraiser_id: string
  confidence: string
  reasoning_context: string
  status: string
  created_at: Date
  estimatedCost?: {
    total: number
    breakdown?: {
      materials: Array<{ item: string; cost: number }>
      labor: Array<{ task: string; rate: number; hours: number }>
      permits: number
      management: number
      contingency: number
    }
  }
  images?: {
    generated?: Array<{
      url: string
      generatedAt: string
      generationId: string
      error?: {
        code: string
        message: string
      }
    }>
    source?: {
      url?: string
      id?: string
      error?: {
        code: string
        message: string
      }
    }
    upscaled?: {
      url?: string
      id?: string
      upscaledAt?: string
      error?: {
        code: string
        message: string
      }
    }
    status?: {
      isUpscaling: boolean
      isGenerating: boolean
      lastError?: {
        code: string
        message: string
        timestamp: string
      }
    }
  }
  metadata?: Record<string, any>
}

export interface ProjectImage {
  id: string
  project_id: string
  type: string
  image_url: string
  ai_analysis?: any
  created_at: Date
  metadata?: Record<string, any>
}

export type ProjectData = z.infer<typeof projectServerEvents.projectData>['data']

export interface AIAnalysisResult {
  isOutdoorSpace: boolean
  description: string
  analysis: string
  suggestions?: ProjectSuggestion[]
}

export interface AIVisionResult {
  description: string
  existingElements: string[]
  newElements: string[]
  communityBenefits: string[]
  maintenanceConsiderations: string[]
  imagePrompt?: string
  imageUrl?: string
}

export interface AIEstimateResult {
  totalEstimate: number
  breakdown: {
    materials: Array<{ item: string; cost: number }>
    labor: Array<{ task: string; rate: number; hours: number }>
    permits: number
    management: number
    contingency: number
  }
  assumptions: string[]
  confidenceScore: number
}

export interface ProjectGroup {
  id: string
  count: number
  _loc_lat: number
  _loc_lng: number
  city: string
  state: string
} 