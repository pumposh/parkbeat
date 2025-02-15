import Link from "next/link"
import { Logo } from "../ui/logo"
import { cn } from "@/lib/utils"

export const Header = () => {
  return (
    <header className="fixed top-0 left-0 right-0 parkbeat-header" style={{ zIndex: 'var(--z-header)' }}>
      <div className="header-content mx-auto px-3 py-1.5">
        <div className="relative">
          <div className="frosted-glass rounded-xl px-3 py-2 flex items-center justify-between relative">
            <Link href="/" className="text-sm font-semibold text-zinc-800 dark:text-zinc-300 hover:text-zinc-600 dark:hover:text-zinc-100 transition">
              <Logo className="
                scale-[0.35]
                absolute
                translate-x-[calc(-50%+16px)]
                translate-y-[-50%]
                drop-shadow-[0_12px_24px_rgba(0,0,0,0.4)]
                dark:drop-shadow-[0_12px_24px_rgba(0,0,0,0.7)]
                " />
            </Link>
            <h1 className={cn(
              "font-display text-xl tracking-wide font-medium",
              "text-zinc-700 dark:text-zinc-300"
            )}>
              Parkbeat
            </h1>
          </div>
        </div>
      </div>
    </header>
  )
} 