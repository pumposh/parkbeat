import { pgTable, text, timestamp, index, serial, numeric, jsonb, pgEnum } from "drizzle-orm/pg-core"

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

export const trees = pgTable(
  "trees",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status").notNull(),
    _loc_lat: numeric("_loc_lat").notNull(),
    _loc_lng: numeric("_loc_lng").notNull(),
    _loc_geohash: text("_loc_geohash").notNull(),
    _meta_created_by: text("_meta_created_by").notNull(),
    _meta_updated_by: text("_meta_updated_by").notNull(),
    _meta_updated_at: timestamp("_meta_updated_at").defaultNow().notNull(),
    _meta_created_at: timestamp("_meta_created_at").defaultNow().notNull(),
  }, (table) => [
    index("Tree_geohash_idx").on(table._loc_geohash)
  ])

// User roles enum
export const userRoleEnum = pgEnum('user_role', ['donor', 'fundraiser', 'both'])

// Project status enum
export const projectStatusEnum = pgEnum('project_status', ['draft', 'active', 'funded', 'completed', 'archived'])

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

// Projects table
export const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    category: projectCategoryEnum("category").notNull(),
    status: projectStatusEnum("status").notNull().default('draft'),
    fundraiserId: text("fundraiser_id").notNull(),
    targetAmount: numeric("target_amount").notNull(),
    currentAmount: numeric("current_amount").default('0').notNull(),
    _loc_lat: numeric("_loc_lat").notNull(),
    _loc_lng: numeric("_loc_lng").notNull(),
    _loc_geohash: text("_loc_geohash").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    metadata: jsonb("metadata"), // For flexible additional data
  },
  (table) => [
    index("project_fundraiser_idx").on(table.fundraiserId),
    index("project_status_idx").on(table.status),
    index("project_category_idx").on(table.category),
    index("project_location_idx").on(table._loc_geohash)
  ]
)

// Project Images table
export const projectImages = pgTable(
  "project_images",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: 'cascade' }),
    type: text("type").notNull(), // 'current', 'vision', 'progress'
    imageUrl: text("image_url").notNull(),
    aiGeneratedUrl: text("ai_generated_url"), // For AI-enhanced/modified versions
    aiAnalysis: jsonb("ai_analysis"), // Store AI's image analysis results
    createdAt: timestamp("created_at").defaultNow().notNull(),
    metadata: jsonb("metadata"), // For flexible additional data
  },
  (table) => [
    index("image_project_idx").on(table.projectId)
  ]
)

// AI Project Recommendations table
export const aiRecommendations = pgTable(
  "ai_recommendations",
  {
    id: text("id").primaryKey(),
    fundraiserId: text("fundraiser_id").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    category: projectCategoryEnum("category").notNull(),
    estimatedCost: jsonb("estimated_cost").notNull(), // Detailed cost breakdown
    confidence: numeric("confidence").notNull(), // AI's confidence in the recommendation
    inspirationImages: jsonb("inspiration_images"), // Array of image URLs that inspired this
    suggestedLocation: jsonb("suggested_location"), // Suggested coordinates and area
    reasoningContext: text("reasoning_context").notNull(), // AI's explanation for the recommendation
    status: text("status").notNull().default('pending'), // 'pending', 'accepted', 'rejected'
    createdAt: timestamp("created_at").defaultNow().notNull(),
    metadata: jsonb("metadata"),
  },
  (table) => [
    index("recommendation_fundraiser_idx").on(table.fundraiserId),
    index("recommendation_category_idx").on(table.category),
    index("recommendation_status_idx").on(table.status)
  ]
)

// Cost Estimates table for detailed project budgeting
export const costEstimates = pgTable(
  "cost_estimates",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: 'cascade' }),
    version: numeric("version").notNull().default('1'),
    totalEstimate: numeric("total_estimate").notNull(),
    breakdown: jsonb("breakdown").notNull(), // Detailed cost categories
    assumptions: jsonb("assumptions").notNull(), // AI's assumptions in making estimates
    confidenceScores: jsonb("confidence_scores"), // AI confidence per category
    createdAt: timestamp("created_at").defaultNow().notNull(),
    metadata: jsonb("metadata"),
  },
  (table) => [
    index("estimate_project_idx").on(table.projectId),
    index("estimate_version_idx").on(table.version)
  ]
)
