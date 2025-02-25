// Core types shared across the backend

import { projectServerEvents } from "../routers/socket/project-handlers"
import { z } from "zod"

// Enums as zod schemas
export const projectStatusSchema = z.enum(['draft', 'active', 'funded', 'completed', 'archived'])
export type ProjectStatus = z.infer<typeof projectStatusSchema>

export const projectCategorySchema = z.enum([
  'urban_greening',
  'park_improvement',
  'community_garden',
  'playground',
  'public_art',
  'sustainability',
  'accessibility',
  'other'
])
export type ProjectCategory = z.infer<typeof projectCategorySchema>

export const userRoleSchema = z.enum(['donor', 'fundraiser', 'both'])
export type UserRole = z.infer<typeof userRoleSchema>

export const costItemTypeSchema = z.enum(['material', 'labor', 'other'])
export type CostItemType = z.infer<typeof costItemTypeSchema>

export const spaceAssessmentSchema = z.object({
  size: z.number().nullable(),
  access: z.string().nullable(),
  complexity: z.enum(['easy', 'moderate', 'difficult']).nullable(),
  constraints: z.array(z.string())
})
export type SpaceAssessment = z.infer<typeof spaceAssessmentSchema>

export const projectCostItemSchema = z.object({
  id: z.string(),
  type: costItemTypeSchema,
  name: z.string(),
  description: z.string().optional(),
  quantity: z.number().optional(),
  unit: z.string().optional(),
  unit_cost: z.number().optional(),
  total_cost: z.number(),
  is_required: z.boolean(),
  notes: z.string().optional(),
  created_at: z.string(),
  updated_at: z.string(),
  metadata: z.record(z.unknown()).optional()
})
export type ProjectCostItem = z.infer<typeof projectCostItemSchema>

export const costBreakdownSchema = z.object({
  materials: z.array(z.object({
    item: z.string(),
    cost: z.string(),
    isIncluded: z.boolean().default(true)
  })),
  labor: z.array(z.object({
    task: z.string().optional(),
    description: z.string(),
    hours: z.number(),
    rate: z.number(),
    isIncluded: z.boolean().default(true)
  })),
  other: z.array(z.object({
    item: z.string(),
    cost: z.string(),
    isIncluded: z.boolean().default(true)
  }))
})
export type CostBreakdown = z.infer<typeof costBreakdownSchema>

export const projectCostBreakdownSchema = z.object({
  materials: z.array(z.object({
    item: z.string(),
    cost: z.string(),
    isIncluded: z.boolean().default(true)
  })),
  labor: z.array(z.object({
    description: z.string(),
    hours: z.number(),
    rate: z.number(),
    isIncluded: z.boolean().default(true)
  })),
  other: z.array(z.object({
    item: z.string(),
    cost: z.string(),
    isIncluded: z.boolean().default(true)
  }))
})
export type ProjectCostBreakdown = z.infer<typeof projectCostBreakdownSchema>

export const costRevisionSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  revision_number: z.number(),
  previous_total: z.number().nullable(),
  new_total: z.number(),
  change_reason: z.string(),
  changed_items: z.array(projectCostItemSchema),
  created_by: z.string(),
  created_at: z.string(),
  metadata: z.record(z.unknown()).optional()
})
export type CostRevision = z.infer<typeof costRevisionSchema>

export const timelineEstimateSchema = z.object({
  start_date: z.string().nullable(),
  duration_days: z.number().nullable(),
  key_milestones: z.array(z.object({
    name: z.string(),
    date: z.string(),
    description: z.string().optional()
  }))
})
export type TimelineEstimate = z.infer<typeof timelineEstimateSchema>

export const projectSuggestionSchema = z.object({
  id: z.string(),
  fundraiser_id: z.string(),
  title: z.string(),
  description: z.string(),
  project_id: z.string().optional(),
  imagePrompt: z.string(),
  images: z.object({
    generated: z.array(z.object({
      url: z.string(),
      generatedAt: z.string(),
      generationId: z.string(),
      error: z.object({
        code: z.string(),
        message: z.string()
      }).optional()
    })).optional(),
    source: z.object({
      url: z.string().optional(),
      id: z.string().optional(),
      error: z.object({
        code: z.string(),
        message: z.string()
      }).optional()
    }),
    upscaled: z.object({
      url: z.string().optional(),
      id: z.string().optional(),
      upscaledAt: z.string().optional(),
      error: z.object({
        code: z.string(),
        message: z.string()
      }).optional()
    }),
    status: z.object({
      isUpscaling: z.boolean(),
      isGenerating: z.boolean(),
      lastError: z.object({
        code: z.string(),
        message: z.string(),
        timestamp: z.string()
      }).nullable()
    })
  }).optional(),
  category: projectCategorySchema,
  estimatedCost: z.object({
    total: z.number(),
    breakdown: costBreakdownSchema
  }).optional(),
  confidence: z.string(),
  reasoning_context: z.string(),
  summary: z.string().nullable(),
  status: z.string(),
  created_at: z.string(),
  metadata: z.record(z.unknown()).optional(),
  skillRequirements: z.string().optional(),
  convertedCosts: z.object({
    costItems: z.array(projectCostItemSchema),
    totalCost: z.number(),
    costBreakdown: projectCostBreakdownSchema
  }).optional(),
  spaceAssessment: spaceAssessmentSchema.optional()
})
export type ProjectSuggestion = z.infer<typeof projectSuggestionSchema>

export const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  status: projectStatusSchema,
  fundraiser_id: z.string(),
  category: projectCategorySchema,
  summary: z.string().nullable(),
  space_assessment: spaceAssessmentSchema,
  total_cost: z.number().nullable(),
  cost_breakdown: projectCostBreakdownSchema,
  skill_requirements: z.string().nullable(),
  timeline_estimate: timelineEstimateSchema,
  source_suggestion_id: z.string().nullable(),
  _loc_lat: z.number(),
  _loc_lng: z.number(),
  _loc_geohash: z.string(),
  _meta_created_by: z.string(),
  _meta_updated_by: z.string(),
  _meta_updated_at: z.string(),
  _meta_created_at: z.string(),
  _view_heading: z.number().nullable(),
  _view_pitch: z.number().nullable(),
  _view_zoom: z.number().nullable()
})
export type Project = z.infer<typeof projectSchema>

export const baseProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  status: projectStatusSchema,
  fundraiser_id: z.string(),
  _loc_lat: z.number(),
  _loc_lng: z.number(),
  _loc_geohash: z.string().optional(),
  _meta_created_by: z.string(),
  _meta_updated_at: z.string(),
  _meta_updated_by: z.string(),
  _meta_created_at: z.string(),
  _view_heading: z.number().optional(),
  _view_pitch: z.number().optional(),
  _view_zoom: z.number().optional(),
  source_suggestion_id: z.string().optional(),
  category: projectCategorySchema.optional(),
  cost_breakdown: costBreakdownSchema.optional(),
})
export type BaseProject = z.infer<typeof baseProjectSchema>

export const projectImageSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  type: z.string(),
  image_url: z.string(),
  ai_analysis: z.any().optional(),
  created_at: z.date(),
  metadata: z.record(z.any()).optional()
})
export type ProjectImage = z.infer<typeof projectImageSchema>

export type ProjectData = z.infer<typeof projectServerEvents.projectData>['data']

export const aiAnalysisResultSchema = z.object({
  isOutdoorSpace: z.boolean(),
  description: z.string(),
  analysis: z.string(),
  suggestions: z.array(projectSuggestionSchema).optional()
})
export type AIAnalysisResult = z.infer<typeof aiAnalysisResultSchema>

export const aiVisionResultSchema = z.object({
  description: z.string(),
  existingElements: z.array(z.string()),
  newElements: z.array(z.string()),
  communityBenefits: z.array(z.string()),
  maintenanceConsiderations: z.array(z.string()),
  imagePrompt: z.string().optional(),
  imageUrl: z.string().optional()
})
export type AIVisionResult = z.infer<typeof aiVisionResultSchema>

export const aiEstimateResultSchema = z.object({
  totalEstimate: z.number(),
  breakdown: z.object({
    materials: z.array(z.object({
      item: z.string(),
      cost: z.number()
    })),
    labor: z.array(z.object({
      task: z.string(),
      description: z.string(),
      rate: z.number(),
      hours: z.number()
    })),
    permits: z.number(),
    management: z.number(),
    contingency: z.number()
  }),
  assumptions: z.array(z.string()),
  confidenceScore: z.number()
})
export type AIEstimateResult = z.infer<typeof aiEstimateResultSchema>

export const projectGroupSchema = z.object({
  id: z.string(),
  count: z.number(),
  _loc_lat: z.number(),
  _loc_lng: z.number(),
  city: z.string(),
  state: z.string()
})
export type ProjectGroup = z.infer<typeof projectGroupSchema> 