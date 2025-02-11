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

export const treeStatus = pgEnum('tree_status', ['draft', 'live', 'archived'])

export const trees = pgTable(
  "trees",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    status: treeStatus("status").notNull(),
    _loc_lat: numeric("_loc_lat").notNull(),
    _loc_lng: numeric("_loc_lng").notNull(),
    _meta_created_by: text("_meta_created_by").notNull(),
    _meta_updated_at: timestamp("_meta_updated_at").defaultNow().notNull(),
    _meta_created_at: timestamp("_meta_created_at").defaultNow().notNull(),
  }, (table) => [
    index("Tree_loc_lat_idx").on(table._loc_lat),
    index("Tree_loc_lng_idx").on(table._loc_lng)
  ])

export const treeSubscriptions = pgTable(
  "tree_subscriptions",
  {
    id: text("id").primaryKey(),
    bound_north: numeric("bound_north").notNull(),
    bound_south: numeric("bound_south").notNull(),
    bound_east: numeric("bound_east").notNull(),
    bound_west: numeric("bound_west").notNull(),
    _meta_created_at: timestamp("_meta_created_at").defaultNow().notNull(),
  }, (table) => [
    index("TreeSubscription_bounds_idx").on(table.bound_north),
    index("TreeSubscription_bounds_idx").on(table.bound_south),
    index("TreeSubscription_bounds_idx").on(table.bound_east),
    index("TreeSubscription_bounds_idx").on(table.bound_west)
  ]
)
