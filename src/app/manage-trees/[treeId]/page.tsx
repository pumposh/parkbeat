'use server'

import { client } from '@/lib/client'
import { getLocationInfo } from "@/lib/location"
import { TreeDialog } from "@/app/components/treebeds/tree-dialog"

export default async function TreePage({
  params,
  searchParams
}: {
  params: { treeId: string }
  searchParams: { lat: string; lng: string }
}) {
  const { lat, lng } = await searchParams
  const { treeId } = await params

  // Parallel fetch both location info and tree data
  const [info, _tree] = await Promise.all([
    getLocationInfo(Number(lat), Number(lng)),
    client.tree.getTree.$get({ id: treeId })
      .then(res => res.json())
      .catch(() => null) // If tree doesn't exist, we're creating a new one
  ])

  const tree = _tree ? {
    ..._tree,
    _meta_updated_at: new Date(_tree._meta_updated_at),
    _meta_created_at: new Date(_tree._meta_created_at)
  } : undefined

  return (
    <TreeDialog 
      lat={Number(lat)} 
      lng={Number(lng)} 
      info={info} 
      tree={tree} 
    />
  )
} 