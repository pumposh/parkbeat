'use server'

import { client } from '@/lib/client'
import { getLocationInfo } from "@/lib/location"
import { TreeDialog } from "@/app/components/treebeds/tree-dialog"
import { auth } from '@clerk/nextjs/server'

export default async function TreePage({
  params,
  searchParams
}: {
  params: { treeId: string }
  searchParams: { lat: string; lng: string }
}) {
  const { lat, lng } = await searchParams
  const { treeId } = await params
  const { userId } = await auth()

  // Parallel fetch both location info and tree data
  const [info, _tree] = await Promise.all([
    getLocationInfo(Number(lat), Number(lng)),
    client.tree.getTree.$get({ id: treeId })
      .then(res => res.json())
      .catch(() => null) // If tree doesn't exist, we're creating a new one
  ])

  const tree = _tree ? {
    id: _tree.id,
    name: _tree.name,
    status: _tree.status,
    _loc_lat: _tree._loc_lat,
    _loc_lng: _tree._loc_lng,
    _meta_created_by: _tree._meta_created_by,
    _meta_updated_by: _tree._meta_updated_by,
    _meta_updated_at: new Date(_tree._meta_updated_at),
    _meta_created_at: new Date(_tree._meta_created_at)
  } : undefined

  return (
    <TreeDialog 
      lat={Number(lat)} 
      lng={Number(lng)} 
      info={info} 
      tree={tree}
      userId={userId || ''}
    />
  )
} 