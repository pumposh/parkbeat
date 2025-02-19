import { pgTable, text, timestamp, index, numeric, jsonb, pgEnum } from "drizzle-orm/pg-core"

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

// Project status enum
export const projectStatusEnum = pgEnum('project_status', ['draft', 'active', 'funded', 'completed', 'archived'])

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
  }, (table) => [
    index("project_geohash_idx").on(table._loc_geohash),
    index("project_status_idx").on(table.status),
    index("project_fundraiser_idx").on(table.fundraiser_id)
  ])

// User roles enum
export const userRoleEnum = pgEnum('user_role', ['donor', 'fundraiser', 'both'])

// Project categories for better organization and discovery
export const projectCategoryEnum = pgEnum('project_category', [
  'urban_greening',
  'park_improvement',
  'community_garden',
  'playground',
  'public_art',
  'sustainability',
  'accessibility',
  'other'
])

// AI Project Recommendations table
export const projectSuggestions = pgTable(
  "project_suggestions",
  {
    id: text("id").primaryKey(),
    fundraiser_id: text("fundraiser_id").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    project_id: text("project_id").notNull().references(() => projects.id, { onDelete: 'cascade' }),
    image_prompt: text("image_prompt").notNull(),
    generated_image_url: text("generated_image_url"),
    category: projectCategoryEnum("category").notNull(),
    estimated_cost: jsonb("estimated_cost").notNull(), // Detailed cost breakdown
    confidence: numeric("confidence").notNull(), // AI's confidence in the recommendation
    inspiration_images: jsonb("inspiration_images"), // Array of image URLs that inspired this
    suggested_location: jsonb("suggested_location"), // Suggested coordinates and area
    reasoning_context: text("reasoning_context").notNull(), // AI's explanation for the recommendation
    status: text("status").notNull().default('pending'), // 'pending', 'accepted', 'rejected'
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
    suggestion_id: text("suggestion_id").references(() => projectSuggestions.id, { onDelete: 'cascade' }),
    type: text("type").notNull(), // 'current', 'vision', 'progress'
    image_url: text("image_url").notNull(),
    ai_generated_url: text("ai_generated_url"), // For AI-enhanced/modified versions
    ai_analysis: jsonb("ai_analysis"), // Store AI's image analysis results
    created_at: timestamp("created_at").defaultNow().notNull(),
    metadata: jsonb("metadata"), // For flexible additional data
  },
  (table) => [
    index("image_project_idx").on(table.project_id),
    index("image_suggestion_idx").on(table.suggestion_id)
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
