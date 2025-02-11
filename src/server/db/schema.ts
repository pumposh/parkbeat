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
    index("Tree_name_idx").on(table.name)
  ])
