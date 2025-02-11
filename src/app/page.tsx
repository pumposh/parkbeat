import { cn } from "@/lib/utils"
import { RecentPost } from "./components/post"
import { Header } from "./components/header"
import { MapController } from "./components/map-controller"
import Image from "next/image"

export default async function Home() {
  return (
    <>
      <RecentPost />
    </>
  )
}
