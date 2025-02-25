import { pgTable, text, timestamp, index, numeric, jsonb, pgEnum, boolean } from "drizzle-orm/pg-core"
import { 
  projectStatusSchema,
  projectCategorySchema,
  userRoleSchema,
  spaceAssessmentSchema,
  projectCostBreakdownSchema,
  timelineEstimateSchema,
  projectSuggestionSchema,
} from "../types/shared"

// Create enums from Zod schemas
export const projectStatusEnum = pgEnum('project_status', projectStatusSchema.options)
export const projectCategoryEnum = pgEnum('project_category', projectCategorySchema.options)
export const userRoleEnum = pgEnum('user_role', userRoleSchema.options)

export const posts = pgTable(
  "posts",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("Post_name_idx").on(table.name)
  ]
)

/** Renamed from 'trees' */
export const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    status: projectStatusEnum("status").notNull(),
    fundraiser_id: text("fundraiser_id").notNull(),
    _loc_lat: numeric("_loc_lat").notNull(),
    _loc_lng: numeric("_loc_lng").notNull(),
    _loc_geohash: text("_loc_geohash").notNull(),
    _meta_created_by: text("_meta_created_by").notNull(),
    _meta_updated_by: text("_meta_updated_by").notNull(),
    _meta_updated_at: timestamp("_meta_updated_at").defaultNow().notNull(),
    _meta_created_at: timestamp("_meta_created_at").defaultNow().notNull(),
    _view_heading: numeric("_view_heading"),
    _view_pitch: numeric("_view_pitch"),
    _view_zoom: numeric("_view_zoom"),
    category: projectCategoryEnum("category").notNull(),
    summary: text("summary"),
    space_assessment: jsonb("space_assessment").$type<typeof spaceAssessmentSchema._type>().default(spaceAssessmentSchema.parse({
      size: null,
      access: null,
      complexity: null,
      constraints: []
    })),
    total_cost: numeric("total_cost"),
    cost_breakdown: jsonb("cost_breakdown").$type<typeof projectCostBreakdownSchema._type>().default(projectCostBreakdownSchema.parse({
      materials: [],
      labor: [],
      other: []
    })),
    skill_requirements: text("skill_requirements"),
    timeline_estimate: jsonb("timeline_estimate").$type<typeof timelineEstimateSchema._type>().default(timelineEstimateSchema.parse({
      start_date: null,
      duration_days: null,
      key_milestones: []
    })),
    source_suggestion_id: text("source_suggestion_id").references(() => projectSuggestions.id),
  }, (table) => [
    index("project_geohash_idx").on(table._loc_geohash),
    index("project_status_idx").on(table.status),
    index("project_fundraiser_idx").on(table.fundraiser_id),
    index("project_category_idx").on(table.category)
  ])

// AI Project Recommendations table
export const projectSuggestions = pgTable(
  "project_suggestions",
  {
    id: text("id").primaryKey(),
    fundraiser_id: text("fundraiser_id").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    project_id: text("project_id"),
    imagePrompt: text("image_prompt").notNull(),
    images: jsonb("images").$type<typeof projectSuggestionSchema.shape.images._type>().default({
      generated: [],
      source: {},
      upscaled: {},
      status: {
        isUpscaling: false,
        isGenerating: false,
        lastError: null
      }
    }),
    category: projectCategoryEnum("category").notNull(),
    estimated_cost: jsonb("estimated_cost").default(null),
    confidence: numeric("confidence").notNull(),
    reasoning_context: text("reasoning_context").default(''),
    summary: text("summary").default(''),
    status: text("status").notNull().default('pending'),
    created_at: timestamp("created_at").defaultNow().notNull(),
    metadata: jsonb("metadata"),
  },
  (table) => [
    index("project_suggestions_project_idx").on(table.project_id)
  ]
)

// Project Images table
export const projectImages = pgTable(
  "project_images",
  {
    id: text("id").primaryKey(),
    project_id: text("project_id").notNull().references(() => projects.id, { onDelete: 'cascade' }),
    type: text("type").notNull(), // 'current', 'vision', 'progress'
    image_url: text("image_url").notNull(),
    ai_analysis: jsonb("ai_analysis"), // Store AI's image analysis results
    created_at: timestamp("created_at").defaultNow().notNull(),
    metadata: jsonb("metadata"), // For flexible additional data
  },
  (table) => [
    index("image_project_idx").on(table.project_id)
  ]
)

// Cost Estimates table for detailed project budgeting
export const costEstimates = pgTable(
  "cost_estimates",
  {
    id: text("id").primaryKey(),
    project_id: text("project_id").notNull().references(() => projects.id, { onDelete: 'cascade' }),
    version: numeric("version").notNull().default('1'),
    total_estimate: numeric("total_estimate").notNull(),
    breakdown: jsonb("breakdown").notNull(), // Detailed cost categories
    assumptions: jsonb("assumptions").notNull(), // AI's assumptions in making estimates
    confidence_scores: jsonb("confidence_scores"), // AI confidence per category
    created_at: timestamp("created_at").defaultNow().notNull(),
    metadata: jsonb("metadata"),
  },
  (table) => [
    index("estimate_project_idx").on(table.project_id),
    index("estimate_version_idx").on(table.version)
  ]
)

// Project Cost Items table for tracking individual cost items
export const projectCostItems = pgTable(
  "project_cost_items",
  {
    id: text("id").primaryKey(),
    project_id: text("project_id").notNull().references(() => projects.id, { onDelete: 'cascade' }),
    type: text("type").notNull(), // 'material', 'labor', 'other'
    name: text("name").notNull(),
    description: text("description"),
    quantity: numeric("quantity"),
    unit: text("unit"),
    unit_cost: numeric("unit_cost"),
    total_cost: numeric("total_cost").notNull(),
    is_required: boolean("is_required").default(true),
    notes: text("notes"),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
    metadata: jsonb("metadata"),
  },
  (table) => [
    index("cost_item_project_idx").on(table.project_id),
    index("cost_item_type_idx").on(table.type)
  ]
)

// Project Cost Revisions table for tracking changes to cost estimates
export const projectCostRevisions = pgTable(
  "project_cost_revisions",
  {
    id: text("id").primaryKey(),
    project_id: text("project_id").notNull().references(() => projects.id, { onDelete: 'cascade' }),
    revision_number: numeric("revision_number").notNull(),
    previous_total: numeric("previous_total"),
    new_total: numeric("new_total").notNull(),
    change_reason: text("change_reason"),
    changed_items: jsonb("changed_items"), // List of items that changed
    created_by: text("created_by").notNull(),
    created_at: timestamp("created_at").defaultNow().notNull(),
    metadata: jsonb("metadata"),
  },
  (table) => [
    index("cost_revision_project_idx").on(table.project_id),
    index("cost_revision_number_idx").on(table.revision_number)
  ]
)
