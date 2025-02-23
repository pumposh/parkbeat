import { logger } from "@/lib/logger";
import { z } from "zod";
import { Env, publicProcedure } from "@/server/jstack";
import { getTreeHelpers } from "../tree-helpers/context";
import { desc, eq, InferInsertModel, like } from "drizzle-orm";
import { projects } from "@/server/db/schema";
import geohash from 'ngeohash'
import type { ProjectStatus, BaseProject, ProjectData } from "../../types/shared";
import { Procedure } from "jstack";
import { ContextWithSuperJSON } from "jstack";
import { Project } from "@/hooks/use-tree-sockets";

export const projectClientEvents = {
  setProject: z.object({
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
      project: z.object({
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
      images: z.array(z.object({
        id: z.string(),
        type: z.string(),
        imageUrl: z.string(),
        aiAnalysis: z.any().optional()
      })).optional(),
      suggestions: z.array(z.object({
        id: z.string(),
        title: z.string(),
        summary: z.string().nullable(),
        imagePrompt: z.string(),
        category: z.string(),
        estimatedCost: z.object({
          total: z.number(),
          breakdown: z.object({
            materials: z.array(z.object({
              item: z.string(),
              cost: z.number()
            })),
            labor: z.array(z.object({
              task: z.string(),
              rate: z.number(),
              hours: z.number()
            })),
            permits: z.number(),
            management: z.number(),
            contingency: z.number()
          }).optional(),
        }).optional(),
        images: z.object({
          generated: z.array(z.object({
            url: z.string(),
            generatedAt: z.string(),
            generationId: z.string()
          })).optional(),
          source: z.object({
            url: z.string().optional(),
            id: z.string().optional()
          }).optional(),
          upscaled: z.object({
            url: z.string().optional(),
            id: z.string().optional(),
            upscaledAt: z.string().optional()
          }).optional()
        }).optional()
      })).optional()
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

const clientEvents = z.object(projectClientEvents)
const serverEvents = z.object(projectServerEvents)
type ProcedureEnv = ContextWithSuperJSON<Env>
type ProcedureContext = Parameters<Parameters<typeof publicProcedure.ws>[0]>[0]['ctx']

type LocalProcedure = Procedure<Env, ProcedureContext, void, typeof clientEvents, typeof serverEvents>
type ProcedureIO = Parameters<Parameters<LocalProcedure["ws"]>[0]>[0]['io']
type ProjectSocket = Parameters<NonNullable<Awaited<ReturnType<Parameters<LocalProcedure["ws"]>[0]>>['onConnect']>>[0]['socket']

export const setupProjectHandlers = (socket: ProjectSocket, ctx: ProcedureContext, io: ProcedureIO, c: ProcedureEnv) => {
  const {
    getSocketId,
    setSocketSubscription,
    getActiveSubscribers,
    setProjectSubscription,
    getProjectData,
    processCleanupQueue,
    cleanup
  } = getTreeHelpers({ ctx, logger })

  let socketId: string | null = null

  logger.info('Initializing WebSocket handler')
  // Project subscription handlers
  socket.on('subscribeProject', async ({ projectId, shouldSubscribe }: { projectId: string; shouldSubscribe: boolean }) => {
    if (shouldSubscribe) {
      logger.info(`Handling project subscription for: ${projectId}`)

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
          logger.info('Project not found, creating empty project data')
        }
        
        socket.emit('projectData', {
          projectId,
          data: projectData
        })
        logger.info(`Subscription complete for project:${projectId}`)
      } catch (error) {
        logger.error('Error in project subscription handler:', error)
        throw error
      }
    } else {
      logger.info(`Unsubscribe event received for project: ${projectId}`)
      try {
        // Get socket ID
        socketId = getSocketId(socket)

        // Leave the Redis room for this project
        socket.leave(`project:${projectId}`)
        logger.info(`Client left Redis room for project:${projectId}`)
      } catch (error) {
        logger.error('Error in project unsubscribe handler:', error)
        throw error
      }
    }
  })

  // Register event handlers
  socket.on('subscribe', async ({ geohash, shouldSubscribe }: { geohash: string; shouldSubscribe: boolean }) => {
    logger.info(`Handling ${shouldSubscribe ? 'subscription' : 'unsubscription'} for area: ${geohash}`)
    const { db } = ctx

    try {
      socketId = getSocketId(socket)
      
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

        const individualProjects = nearbyProjects
          .map(project => ({
            id: project.id,
            name: project.name,
            status: project.status as ProjectStatus,
            _loc_lat: parseFloat(project._loc_lat),
            _loc_lng: parseFloat(project._loc_lng),
            _meta_created_by: project._meta_created_by,
            _meta_updated_by: project._meta_updated_by,
            _meta_updated_at: project._meta_updated_at.toISOString(),
            _meta_created_at: project._meta_created_at.toISOString()
          }))

        if (individualProjects.length > 0) {
          // Convert dates to proper format for emission
          const projectsToEmit = individualProjects.map(project => ({
            ...project,
            _meta_updated_at: new Date(project._meta_updated_at).toISOString(),
            _meta_created_at: new Date(project._meta_created_at).toISOString()
          }));

          await io.to(`geohash:${geohash}`).emit('subscribe', { geohash, projects: projectsToEmit })
        }

        logger.info(`\n\nSubscription complete for geohash:${geohash} - Found ${nearbyProjects.length} projects, emitted ${individualProjects.length} projects`)
      } else {
        // Handle unsubscription
        socket.leave(`geohash:${geohash}`)
        logger.info(`\n\nUnsubscription complete for geohash:${geohash}`)
      }
    } catch (error) {
      logger.error('Error in subscription handler:', error)
      throw error
    }
  })

  socket.on('deleteProject', async (data: { id: string }) => {
    logger.info(`Processing project deletion: ${data.id}`)
    const { db } = ctx

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

  socket.on('setProject', async (data: {
    id: string
    name: string
    description?: string
    status: ProjectStatus
    _loc_lat: number
    _loc_lng: number
    _meta_created_by: string
    _meta_updated_by: string
    _meta_updated_at: string
    _meta_created_at: string
    _view_heading?: number
    _view_pitch?: number
    _view_zoom?: number
  }) => {
    logger.info(`Processing project update: ${data.name} (${data.id})`)
    const { db } = ctx

    try {
      const hash = geohash.encode(data._loc_lat, data._loc_lng)
      console.log(data)
      console.log('created by', data._meta_created_by);
      const projectData: InferInsertModel<typeof projects> = {
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
        _view_zoom: data._view_zoom?.toString() || null
      } as const;

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

      logger.info(
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
}