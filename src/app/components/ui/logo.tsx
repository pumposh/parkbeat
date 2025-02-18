'use client'
import Image from "next/image"
import ParkbeatLogo from "@/../public/parkbeat.svg"
import Mask from "@/../public/mask-no-background.png"
import "./style.css"
import { cn } from "@/lib/utils"
import { useState } from "react"

const Tree = ({ className }: { className?: string }) => {
  const [isLoaded, setIsLoaded] = useState(false)
  const tree = (
    <Image
      src={ParkbeatLogo}
      onLoad={() => setIsLoaded(true)}
      alt="Parkbeat Logo"
      fill
      sizes="(max-width: 768px) 96px, 96px"
      className={cn("transition-opacity duration-150 ease-in-out object-cover dark:invert overflow-hidden brightness-110 dark:brightness-[1.95] dark:contrast-[0.8] scale-125 logo-shadow mt-1.5 !h-[86%] object-top", className)}
      style={{ opacity: isLoaded ? 1 : 0 }}
      priority
      loading="eager"
      fetchPriority="high"
    />
  )
  return tree
}


const MaskEl = () => {
  const [isLoaded, setIsLoaded] = useState(false)
  const mask = (
    <Image
      src={Mask}
      onLoad={() => setIsLoaded(true)}
      alt="Mask"
      fill
      priority
      loading="eager"
      fetchPriority="high"
      sizes="(max-width: 768px) 96px, 96px"
      className="transition-opacity duration-150 ease-in-out absolute inset-0 object-contain overflow-visible scale-[1.65] brightness-[0.9] dark:brightness-[0.83]"
      style={{ opacity: isLoaded ? 1 : 0 }}
    />
  )
  return mask
}

export const Logo = ({ className, maskWithBackground = true }: { className?: string, maskWithBackground?: boolean }) => {
  // return (
  //   <div className={cn("relative w-24 h-24 dark:invert transition-opacity duration-300 ease-in-out", className)}>
  //     <Tree className="dark:invert overflow-visible" />
  //   </div>
  // )
  return (
    <div className={cn("relative dark:bg-[#ffffff69] w-24 h-24 rounded-full p-2 outline outline-8 outline-zinc-300 dark:outline-zinc-500 dark:invert shadow-xl overflow-visible transition-opacity duration-300 ease-in-out", className)}
    style={{ backgroundColor: '#F2F0E630' }}>
      <Tree />
      <MaskEl />
    </div>
  )
}