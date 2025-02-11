'use server'

import { TreeDialog } from "@/app/components/treebeds/tree-dialog"

export default async function TreePage(props: {
  searchParams: {
    lat: string
    lng: string
  }
}) {
  return <TreeDialog lat={Number(props.searchParams.lat)} lng={Number(props.searchParams.lng)} />
} 