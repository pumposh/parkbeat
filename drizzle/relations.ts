import { relations } from "drizzle-orm/relations";
import { projects, costEstimates, projectImages, projectSuggestions, projectCostItems, projectCostRevisions, projectContributions } from "./schema";

export const costEstimatesRelations = relations(costEstimates, ({one}) => ({
	project: one(projects, {
		fields: [costEstimates.projectId],
		references: [projects.id]
	}),
}));

export const projectsRelations = relations(projects, ({one, many}) => ({
	costEstimates: many(costEstimates),
	projectImages: many(projectImages),
	projectSuggestion: one(projectSuggestions, {
		fields: [projects.sourceSuggestionId],
		references: [projectSuggestions.id]
	}),
	projectCostItems: many(projectCostItems),
	projectCostRevisions: many(projectCostRevisions),
	projectContributions: many(projectContributions),
}));

export const projectImagesRelations = relations(projectImages, ({one}) => ({
	project: one(projects, {
		fields: [projectImages.projectId],
		references: [projects.id]
	}),
}));

export const projectSuggestionsRelations = relations(projectSuggestions, ({many}) => ({
	projects: many(projects),
}));

export const projectCostItemsRelations = relations(projectCostItems, ({one}) => ({
	project: one(projects, {
		fields: [projectCostItems.projectId],
		references: [projects.id]
	}),
}));

export const projectCostRevisionsRelations = relations(projectCostRevisions, ({one}) => ({
	project: one(projects, {
		fields: [projectCostRevisions.projectId],
		references: [projects.id]
	}),
}));

export const projectContributionsRelations = relations(projectContributions, ({one}) => ({
	project: one(projects, {
		fields: [projectContributions.projectId],
		references: [projects.id]
	}),
}));