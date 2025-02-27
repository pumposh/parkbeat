import { pgTable, index, text, timestamp, foreignKey, numeric, jsonb, boolean, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const contributionType = pgEnum("contribution_type", ['funding', 'social'])
export const projectCategory = pgEnum("project_category", ['urban_greening', 'park_improvement', 'community_garden', 'playground', 'public_art', 'sustainability', 'accessibility', 'other'])
export const projectStatus = pgEnum("project_status", ['draft', 'active', 'funded', 'completed', 'archived'])
export const treeStatus = pgEnum("tree_status", ['draft', 'live', 'archived'])
export const userRole = pgEnum("user_role", ['donor', 'fundraiser', 'both'])


export const posts = pgTable("posts", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("Post_name_idx").using("btree", table.name.asc().nullsLast().op("text_ops")),
]);

export const costEstimates = pgTable("cost_estimates", {
	id: text().primaryKey().notNull(),
	projectId: text("project_id").notNull(),
	version: numeric().default('1').notNull(),
	totalEstimate: numeric("total_estimate").notNull(),
	breakdown: jsonb().notNull(),
	assumptions: jsonb().notNull(),
	confidenceScores: jsonb("confidence_scores"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	metadata: jsonb(),
}, (table) => [
	index("estimate_project_idx").using("btree", table.projectId.asc().nullsLast().op("text_ops")),
	index("estimate_version_idx").using("btree", table.version.asc().nullsLast().op("numeric_ops")),
	foreignKey({
			columns: [table.projectId],
			foreignColumns: [projects.id],
			name: "cost_estimates_project_id_projects_id_fk"
		}).onDelete("cascade"),
]);

export const projectImages = pgTable("project_images", {
	id: text().primaryKey().notNull(),
	projectId: text("project_id").notNull(),
	type: text().notNull(),
	imageUrl: text("image_url").notNull(),
	aiAnalysis: jsonb("ai_analysis"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	metadata: jsonb(),
}, (table) => [
	index("image_project_idx").using("btree", table.projectId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.projectId],
			foreignColumns: [projects.id],
			name: "project_images_project_id_projects_id_fk"
		}).onDelete("cascade"),
]);

export const projectSuggestions = pgTable("project_suggestions", {
	id: text().primaryKey().notNull(),
	fundraiserId: text("fundraiser_id").notNull(),
	title: text().notNull(),
	description: text().notNull(),
	projectId: text("project_id"),
	imagePrompt: text("image_prompt").notNull(),
	category: projectCategory().notNull(),
	estimatedCost: jsonb("estimated_cost").default(null),
	confidence: numeric().notNull(),
	reasoningContext: text("reasoning_context").default(''),
	status: text().default('pending').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	metadata: jsonb(),
	images: jsonb().default({"source":{},"status":{"lastError":null,"isUpscaling":false,"isGenerating":false},"upscaled":{},"generated":[]}),
	summary: text().default(''),
}, (table) => [
	index("project_suggestions_project_idx").using("btree", table.projectId.asc().nullsLast().op("text_ops")),
]);

export const projects = pgTable("projects", {
	id: text().primaryKey().notNull(),
	description: text(),
	status: projectStatus().notNull(),
	metaUpdatedBy: text("_meta_updated_by").notNull(),
	locLat: numeric("_loc_lat").notNull(),
	locLng: numeric("_loc_lng").notNull(),
	locGeohash: text("_loc_geohash").notNull(),
	metaUpdatedAt: timestamp("_meta_updated_at", { mode: 'string' }).defaultNow().notNull(),
	metaCreatedBy: jsonb("_meta_created_by"),
	name: text().notNull(),
	metaCreatedAt: timestamp("_meta_created_at", { mode: 'string' }).defaultNow().notNull(),
	viewHeading: numeric("_view_heading"),
	viewPitch: numeric("_view_pitch"),
	viewZoom: numeric("_view_zoom"),
	fundraiserId: text("fundraiser_id").notNull(),
	category: projectCategory().default('other').notNull(),
	summary: text(),
	spaceAssessment: jsonb("space_assessment").default({"size":null,"access":null,"complexity":null,"constraints":[]}),
	totalCost: numeric("total_cost"),
	costBreakdown: jsonb("cost_breakdown").default({"labor":[],"other":[],"materials":[]}),
	skillRequirements: text("skill_requirements"),
	timelineEstimate: jsonb("timeline_estimate").default({"start_date":null,"duration_days":null,"key_milestones":[]}),
	sourceSuggestionId: text("source_suggestion_id"),
}, (table) => [
	index("project_category_idx").using("btree", table.category.asc().nullsLast().op("enum_ops")),
	index("project_fundraiser_idx").using("btree", table.fundraiserId.asc().nullsLast().op("text_ops")),
	index("project_geohash_idx").using("btree", table.locGeohash.asc().nullsLast().op("text_ops")),
	index("project_status_idx").using("btree", table.status.asc().nullsLast().op("enum_ops")),
	foreignKey({
			columns: [table.sourceSuggestionId],
			foreignColumns: [projectSuggestions.id],
			name: "projects_source_suggestion_id_project_suggestions_id_fk"
		}),
]);

export const projectCostItems = pgTable("project_cost_items", {
	id: text().primaryKey().notNull(),
	projectId: text("project_id").notNull(),
	type: text().notNull(),
	name: text().notNull(),
	description: text(),
	quantity: numeric(),
	unit: text(),
	unitCost: numeric("unit_cost"),
	totalCost: numeric("total_cost").notNull(),
	isRequired: boolean("is_required").default(true),
	notes: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	metadata: jsonb(),
}, (table) => [
	index("cost_item_project_idx").using("btree", table.projectId.asc().nullsLast().op("text_ops")),
	index("cost_item_type_idx").using("btree", table.type.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.projectId],
			foreignColumns: [projects.id],
			name: "project_cost_items_project_id_projects_id_fk"
		}).onDelete("cascade"),
]);

export const projectCostRevisions = pgTable("project_cost_revisions", {
	id: text().primaryKey().notNull(),
	projectId: text("project_id").notNull(),
	revisionNumber: numeric("revision_number").notNull(),
	previousTotal: numeric("previous_total"),
	newTotal: numeric("new_total").notNull(),
	changeReason: text("change_reason"),
	changedItems: jsonb("changed_items"),
	createdBy: text("created_by").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	metadata: jsonb(),
}, (table) => [
	index("cost_revision_number_idx").using("btree", table.revisionNumber.asc().nullsLast().op("numeric_ops")),
	index("cost_revision_project_idx").using("btree", table.projectId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.projectId],
			foreignColumns: [projects.id],
			name: "project_cost_revisions_project_id_projects_id_fk"
		}).onDelete("cascade"),
]);

export const projectContributions = pgTable("project_contributions", {
	id: text().primaryKey().notNull(),
	projectId: text("project_id").notNull(),
	userId: text("user_id").notNull(),
	contributionType: contributionType("contribution_type").notNull(),
	amountCents: numeric("amount_cents"),
	message: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	metadata: jsonb(),
}, (table) => [
	index("contribution_project_idx").using("btree", table.projectId.asc().nullsLast().op("text_ops")),
	index("contribution_type_idx").using("btree", table.contributionType.asc().nullsLast().op("enum_ops")),
	index("contribution_user_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.projectId],
			foreignColumns: [projects.id],
			name: "project_contributions_project_id_projects_id_fk"
		}).onDelete("cascade"),
]);
