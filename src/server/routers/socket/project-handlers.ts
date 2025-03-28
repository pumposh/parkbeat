import { getLogger } from "@/lib/logger";
import { z } from "zod";
import { Env, publicProcedure } from "@/server/jstack";
import { getTreeHelpers } from "../tree-helpers/context";
import { desc, eq, InferInsertModel, like, sql, and } from "drizzle-orm";
import { projects, projectContributions } from "@/server/db/schema";
import geohash from 'ngeohash'
import { type ProjectStatus, type BaseProject, type ProjectData, projectSuggestionSchema, projectSchema, baseProjectSchema, contributionSummarySchema, CostBreakdown, ProjectCostBreakdown } from "../../types/shared";
import { Procedure } from "jstack";
import { ContextWithSuperJSON } from "jstack";
import { DedupeThing } from "@/lib/promise";
import { ParkbeatLogger } from "@/lib/logger";
import { AIIO, clientEventsSchema, serverEventsSchema } from "./types";
import { convertNestedToFlatCostBreakdown } from "@/lib/cost";

type Logger = ParkbeatLogger.GroupLogger | ParkbeatLogger.Logger | typeof console

export const projectClientEvents = {
  setProject: baseProjectSchema,
  deleteProject: z.object({
    id: z.string(),
  }),
  subscribe: z.object({
    geohash: z.string(),
    shouldSubscribe: z.boolean(),
    projects: z.array(z.object({
      id: z.string(),
      name: z.string(),
      description: z.string().optional(),
      status: z.enum(['draft', 'active', 'funded', 'completed', 'archived']),
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
    })).optional(),
  }),
  subscribeProject: z.object({
    projectId: z.string(),
    shouldSubscribe: z.boolean()  
  }),
  addContribution: z.object({
    project_id: z.string(),
    user_id: z.string(),
    contribution_type: z.enum(['funding', 'social']),
    amount_cents: z.number().optional(),
    message: z.string().optional(),
    id: z.string()
  })
};

export const projectServerEvents = {
  newProject: z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    status: z.enum(['draft', 'active', 'funded', 'completed', 'archived']),
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
  }),
  projectData: z.object({
    projectId: z.string(),
    data: z.object({
      project: baseProjectSchema,
      images: z.array(z.object({
        id: z.string(),
        type: z.string(),
        imageUrl: z.string(),
        aiAnalysis: z.any().optional()
      })).optional(),
      suggestions: z.array(projectSuggestionSchema).optional(),
      contribution_summary: contributionSummarySchema.optional()
    })
  }),
  subscribe: z.object({
    geohash: z.string(),
    projects: z.array(z.object({
      id: z.string(),
      name: z.string(),
      description: z.string().optional(),
      status: z.enum(['draft', 'active', 'funded', 'completed', 'archived']),
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
    })).optional(),
  }),
  deleteProject: z.object({
    id: z.string(),
  })
};

export const projectEvents = {
  client: z.object(projectClientEvents),
  server: z.object(projectServerEvents)
}

type ProcedureEnv = ContextWithSuperJSON<Env>
type ProcedureContext = Parameters<Parameters<typeof publicProcedure.ws>[0]>[0]['ctx']

type LocalProcedure = Procedure<Env, ProcedureContext, void, typeof clientEventsSchema, typeof serverEventsSchema>
type ProcedureIO = Parameters<Parameters<LocalProcedure["ws"]>[0]>[0]['io']
type ProjectSocket = Parameters<NonNullable<Awaited<ReturnType<Parameters<LocalProcedure["ws"]>[0]>>['onConnect']>>[0]['socket']

export const setupProjectHandlers = (
  socket: ProjectSocket,
  ctx: ProcedureContext,
  io: ProcedureIO,
  c: ProcedureEnv,
  logger: Logger,
) => {
  const {
    getSocketId,
    setSocketSubscription,
    getActiveSubscribers,
    setProjectSubscription,
    getProjectData,
    processCleanupQueue,
    cleanup,
    enqueueSubscriptionCleanup,
    addProjectContribution,
    notifyProjectSubscribers
  } = getTreeHelpers({ ctx, logger })

  let socketId: string | null = null

  // Project subscription handlers
  socket.on('subscribeProject', async ({ projectId, shouldSubscribe }: { projectId: string; shouldSubscribe: boolean }) => {
    socketId = getSocketId(socket)

    const deduped = await DedupeThing.getInstance()
      .dedupe(socketId, 'subscribeProject', projectId, shouldSubscribe)
    if (!deduped) {
      logger.log(`Duplicate subscribeProject event for project: ${projectId}`)
      return;
    }

    if (shouldSubscribe) {
      logger.log(`Handling project subscription for: ${projectId}`)

      try {
        await processCleanupQueue()
        socketId = getSocketId(socket)

        if (socketId) await cleanup(socketId, ['project'])
        await socket.join(`project:${projectId}`)
        
        if (socketId) await setProjectSubscription(socketId, projectId)

        let projectData: ProjectData = {
          project: { id: projectId, status: 'draft' } as BaseProject,
          images: [],
          suggestions: []
        }

        try {
          // Fetch project data
          projectData = await getProjectData(projectId) ?? projectData
        } catch (error) {
          console.log('Project not found, creating empty project data')
        }
        
        socket.emit('projectData', {
          projectId,
          data: projectData
        })
        console.log(`Subscription complete for project:${projectId}`)
      } catch (error) {
        console.error('Error in project subscription handler:', error)
        throw error
      }
    } else {
      logger.log(`Unsubscribe event received for project: ${projectId}`)
      try {
        // Get socket ID
        socketId = getSocketId(socket)

        if (socketId) enqueueSubscriptionCleanup(c, socketId, ['project'])

        // Leave the Redis room for this project
        socket.leave(`project:${projectId}`)
        logger.log(`Client left Redis room for project:${projectId}`)
      } catch (error) {
        logger.error('Error in project unsubscribe handler:', error)
        throw error
      }
    }
  })

  // Register event handlers
  socket.on('subscribe', async ({ geohash, shouldSubscribe }: { geohash: string; shouldSubscribe: boolean }) => {
    logger.log(`Handling ${shouldSubscribe ? 'subscription' : 'unsubscription'} for area: ${geohash}`)
    const { db } = ctx

    try {
      socketId = getSocketId(socket)

      const deduped = await DedupeThing.getInstance()
        .dedupe(socketId, geohash, shouldSubscribe)
      if (!deduped) return;
      
      if (shouldSubscribe) {
        await processCleanupQueue()
        if (socketId) await cleanup(socketId, ['geohash'])

        await socket.join(`geohash:${geohash}`)
      
        if (socketId) await setSocketSubscription(socketId, geohash)

        const nearbyProjects = await db
          .select()
          .from(projects)
          .where(like(projects._loc_geohash, `${geohash}%`))
          .orderBy(desc(projects._loc_geohash))

        const individualProjects = await Promise.all(nearbyProjects
          .map(async project => ({
            id: project.id,
            name: project.name,
            status: project.status as ProjectStatus,
            _loc_lat: parseFloat(project._loc_lat),
            _loc_lng: parseFloat(project._loc_lng),
            _meta_created_by: project._meta_created_by,
            _meta_updated_by: project._meta_updated_by,
            _meta_updated_at: project._meta_updated_at.toISOString(),
            _meta_created_at: project._meta_created_at.toISOString(),
            // Include cost breakdown for funding progress display
            cost_breakdown: project.cost_breakdown,
            // Include a simplified contribution summary for map markers
            contribution_summary: project.id ? await getContributionSummary(project.id, db) : undefined
          })))

        if (individualProjects.length > 0) {
          // Convert dates to proper format for emission
          const projectsToEmit = individualProjects.map(project => ({
            ...project,
            _meta_updated_at: new Date(project._meta_updated_at).toISOString(),
            _meta_created_at: new Date(project._meta_created_at).toISOString()
          }));

          await io.to(`geohash:${geohash}`).emit('subscribe', { geohash, projects: projectsToEmit })
        }

        logger.log(`\n\nSubscription complete for geohash:${geohash} - Found ${nearbyProjects.length} projects, emitted ${individualProjects.length} projects`)
      } else {
        // Handle unsubscription
        socket.leave(`geohash:${geohash}`)
        logger.log(`\n\nUnsubscription complete for geohash:${geohash}`)
      }
    } catch (error) {
      logger.error('Error in subscription handler:', error)
      throw error
    }
  })

  socket.on('deleteProject', async (data: { id: string }) => {
    logger.log(`Processing project deletion: ${data.id}`)
    const { db } = ctx

    const deduped = await DedupeThing.getInstance()
      .dedupe(socketId, 'deleteProject', data.id)
    if (!deduped) return;

    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, data.id))
      .limit(1)

    if (!project) {
      throw new Error('Project not found')
    }

    if (project.status === 'active') {
      throw new Error('Cannot delete an active project')
    }

    await db.delete(projects).where(eq(projects.id, data.id))

    const {
      getActiveSubscribers,
    } = getTreeHelpers({ ctx, logger })

    // Emit to all parent geohashes
    for (let precision = project._loc_geohash.length; precision > 0; precision--) {
      const parentHash = project._loc_geohash.substring(0, precision)
      const activeSocketIds = await getActiveSubscribers(parentHash)
      if (activeSocketIds.length > 0) {
        await io.to(`geohash:${parentHash}`).emit('deleteProject', { id: data.id })
      }
    }

    try {
      await db.delete(projects).where(eq(projects.id, data.id))
    } catch (error) {
      logger.error('Error in deleteProject handler:', error)
      throw error
    }
  })

  socket.on('setProject', async (data) => {
    logger.log(`Processing project update: ${data.name} (${data.id})`)
    const { db } = ctx

    try {
      const hash = geohash.encode(data._loc_lat, data._loc_lng)
      
      // Convert cost breakdown to the flat format expected by the database schema
      const processedCostBreakdown = data.cost_breakdown ? 
        (typeof data.cost_breakdown === 'string' 
          ? JSON.parse(data.cost_breakdown) 
          : ('materials' in data.cost_breakdown && 'items' in data.cost_breakdown.materials)
            ? convertNestedToFlatCostBreakdown(data.cost_breakdown as CostBreakdown)
            : data.cost_breakdown) 
        : { materials: [], labor: [], other: [] };
        
      const projectData = {
        id: data.id,
        name: data.name,
        description: data.description || null,
        status: data.status,
        fundraiser_id: data._meta_created_by,
        _loc_lat: data._loc_lat.toString(),
        _loc_lng: data._loc_lng.toString(),
        _loc_geohash: hash,
        _meta_created_by: data._meta_created_by,
        _meta_updated_by: data._meta_updated_by,
        _meta_updated_at: new Date(data._meta_updated_at),
        _meta_created_at: new Date(data._meta_created_at),
        _view_heading: data._view_heading?.toString() || null,
        _view_pitch: data._view_pitch?.toString() || null,
        _view_zoom: data._view_zoom?.toString() || null,
        source_suggestion_id: data.source_suggestion_id,
        cost_breakdown: processedCostBreakdown,
        category: data.category || 'other', 
        summary: '',
        skill_requirements: '',
        space_assessment: {
          size: null,
          access: null,
          complexity: null, 
          constraints: []
        }
      };

      const existingProject = await db
        .select()
        .from(projects)
        .where(eq(projects.id, data.id))
        .limit(1)
        .then(rows => rows[0]);

      let result;
      if (existingProject) {
        const [updatedProject] = await db
          .update(projects)
          .set(projectData)
          .where(eq(projects.id, data.id))
          .returning();
        if (!updatedProject) throw new Error('Failed to update project');
        result = updatedProject;
      } else {
        const [newProject] = await db
          .insert(projects)
          .values(projectData)
          .returning();
        if (!newProject) throw new Error('Failed to insert project');
        result = newProject;
      }

      if (!result) {
        throw new Error('Failed to upsert project')
      }

      const projectToEmit: BaseProject = {
        id: result.id,
        name: result.name,
        description: result?.description || undefined,
        status: result.status as ProjectStatus,
        fundraiser_id: result.fundraiser_id,
        source_suggestion_id: result.source_suggestion_id || undefined,
        cost_breakdown: result.cost_breakdown || undefined,
        _loc_lat: parseFloat(result._loc_lat),
        _loc_lng: parseFloat(result._loc_lng),
        _loc_geohash: result._loc_geohash,
        _meta_created_by: result._meta_created_by,
        _meta_updated_by: result._meta_updated_by,
        _meta_updated_at: result._meta_updated_at.toISOString(),
        _meta_created_at: result._meta_created_at.toISOString(),
        _view_heading: result._view_heading ? parseFloat(result._view_heading) : undefined,
        _view_pitch: result._view_pitch ? parseFloat(result._view_pitch) : undefined,
        _view_zoom: result._view_zoom ? parseFloat(result._view_zoom) : undefined
      }

      const projectHash = hash
      socketId = getSocketId(socket)

      // Track metrics for geohash emissions
      let emittedCount = 0
      let skippedCount = 0
      let totalSubscribers = 0

      // Emit to all parent geohashes
      for (let precision = projectHash.length; precision > 0; precision--) {
        const parentHash = projectHash.substring(0, precision)
        const activeSocketIds = await getActiveSubscribers(parentHash)
        totalSubscribers += activeSocketIds.length
        
        if (activeSocketIds.length > 0) {
          await io.to(`geohash:${parentHash}`).emit('newProject', projectToEmit)
          emittedCount++
        } else {
          skippedCount++
        }
      }

      // Emit project data update to project subscribers
      const projectDataUpdate = await getProjectData(result.id)

      if (!projectDataUpdate) return;
      
      await io.to(`project:${result.id}`).emit('projectData', {
        projectId: result.id,
        data: projectDataUpdate
      })

      logger.log(
        `Project ${existingProject ? 'updated' : 'created'}: ${result.id} - ` +
        `Emitted to ${emittedCount} geohashes (${totalSubscribers} total subscribers), ` +
        `skipped ${skippedCount} empty geohashes and notified project subscribers`
      )

      return projectToEmit
    } catch (error) {
      logger.error('Error processing project update:', error)
      throw error
    }
  })

  // Handler for adding a contribution to a project
  socket.on('addContribution', async (contribution) => {
    logger.log(`Processing contribution for project: ${contribution.project_id}`)
    
    try {
      const deduped = await DedupeThing.getInstance()
        .dedupe(socketId, 'addContribution', contribution.project_id)
      if (!deduped) return;

      // Add the contribution to the database
      const result = await addProjectContribution({
        project_id: contribution.project_id,
        user_id: contribution.user_id,
        contribution_type: contribution.contribution_type,
        amount_cents: contribution.amount_cents,
        message: contribution.message,
        id: contribution.id // Pass the ID from the client
      })
      
      // Notify all subscribers about the updated project data
      // If the status changed, pass null as socketId to ensure all subscribers are notified
      // Otherwise, just pass the current socket ID
      const notifySocketId = result.statusChanged ? null : getSocketId(socket)
      await notifyProjectSubscribers(contribution.project_id, notifySocketId, io as unknown as AIIO)
      
      if (result.statusChanged) {
        logger.log(`Project ${contribution.project_id} status changed to 'funded'. All subscribers notified.`)
      } else {
        logger.log(`Successfully added contribution to project ${contribution.project_id}`)
      }
      
      return result.contribution
    } catch (error) {
      logger.error('Error processing contribution:', error)
      throw error
    }
  })
}

async function getContributionSummary(projectId: string, db: any) {
  // Create a logger instance for this function
  const logger = getLogger();
  
  try {
    // Use Drizzle to get the total contributions for this project
    const contributionResult = await db
      .select({
        total_amount_cents: sql`COALESCE(SUM(${projectContributions.amount_cents}), 0)`.as('total_amount_cents'),
        contributor_count: sql`COUNT(DISTINCT ${projectContributions.user_id})`.as('contributor_count')
      })
      .from(projectContributions)
      .where(
        and(
          eq(projectContributions.project_id, projectId),
          eq(projectContributions.contribution_type, 'funding')
        )
      );
    
    // Get the top two contributors by total contribution amount
    const topContributors = await db
      .select({
        user_id: projectContributions.user_id,
        total_contribution: sql`SUM(${projectContributions.amount_cents})`.as('total_contribution')
      })
      .from(projectContributions)
      .where(
        and(
          eq(projectContributions.project_id, projectId),
          eq(projectContributions.contribution_type, 'funding')
        )
      )
      .groupBy(projectContributions.user_id)
      .orderBy(sql`total_contribution DESC`)
      .limit(2);
    
    // Extract the result (should be a single row)
    const summary = contributionResult[0] || { total_amount_cents: 0, contributor_count: 0 };
    
    return {
      total_amount_cents: Number(summary.total_amount_cents) || 0,
      contributor_count: Number(summary.contributor_count) || 0,
      top_contributors: topContributors.map((contributor: { user_id: string; total_contribution: string }) => ({
        user_id: contributor.user_id,
        amount_cents: Number(contributor.total_contribution) || 0
      }))
    };
  } catch (error) {
    logger.error('Error getting contribution summary:', error);
    return {
      total_amount_cents: 0,
      contributor_count: 0,
      top_contributors: []
    };
  }
}