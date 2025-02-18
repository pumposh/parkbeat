'use server'

import { client } from '@/lib/client'
import { getLocationInfo } from "@/lib/location"
import { TreeDialog } from "@/app/components/treebeds/tree-dialog"
import { auth } from '@clerk/nextjs/server'

export default async function TreePage({
  params,
  searchParams
}: {
  params: { projectId: string }
  searchParams: { lat: string; lng: string }
}) {
  const { lat, lng } = await searchParams
  const { projectId } = await params
  const { userId } = await auth()

  // Parallel fetch both location info and tree data
  const [info, _project] = await Promise.all([
    getLocationInfo(Number(lat), Number(lng)),
    client.tree.getProject.$get({ id: projectId })
      .then(res => res.json())
      .catch(() => null) // If tree doesn't exist, we're creating a new one
  ])

  const project = _project ? {
    id: _project.id,
    name: _project.name,
    status: _project.status,
    _loc_lat: _project._loc_lat,
    _loc_lng: _project._loc_lng,
    _meta_created_by: _project._meta_created_by,
    _meta_updated_by: _project._meta_updated_by,
    _meta_updated_at: new Date(_project._meta_updated_at),
    _meta_created_at: new Date(_project._meta_created_at)
  } : undefined

  return (
    <TreeDialog 
      lat={Number(lat)} 
      lng={Number(lng)} 
      info={info} 
      project={project}
      userId={userId || ''}
    />
  )
} 