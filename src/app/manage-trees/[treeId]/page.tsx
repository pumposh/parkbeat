'use server'

import { TreeDialog } from "@/app/components/treebeds/tree-dialog"

export default async function TreePage(props: {
  searchParams: {
    lat: string
    lng: string
  }
}) {
  const { lat, lng } = await props.searchParams;
  return <TreeDialog lat={Number(lat)} lng={Number(lng)} />
} 