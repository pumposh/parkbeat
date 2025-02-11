import Image from "next/image"
import ParkbeatLogo from "@/../public/parkbeat.svg"
import Mask from "@/../public/mask-no-background.png"
import "./style.css"
import { cn } from "@/lib/utils"

export const Logo = ({ className, maskWithBackground = true }: { className?: string, maskWithBackground?: boolean }) => {
  return (
    <div className={cn("relative w-24 h-24 rounded-full p-2 outline outline-8 outline-zinc-300 dark:outline-zinc-500 dark:invert shadow-xl overflow-visible", className)}
    style={{ backgroundColor: '#F2F0E630' }}>
    <Image
      src={ParkbeatLogo}
      alt="Parkbeat Logo"
      fill
      className="object-cover dark:invert overflow-hidden brightness-110 dark:brightness-[1.95] dark:contrast-[0.8] scale-125 logo-shadow mt-1.5 !h-[86%] object-top"
      priority
    />
    <Image
      src={Mask}
      alt="Mask"
      fill
      className="absolute inset-0 object-contain overflow-visible scale-[1.65] brightness-[0.9] dark:brightness-[0.83]"
    />
  </div>
  )
}