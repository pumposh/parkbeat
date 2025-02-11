import Link from "next/link"
import { SettingsDialog } from "./settings-dialog"

export const Header = () => {
  return (
    <header className="fixed top-0 left-0 right-0 parkbeat-header" style={{ zIndex: 'var(--z-header)' }}>
      <div className="header-content mx-auto px-3 py-1.5">
        <div className="relative">
          {/* Gradient border using pseudo-element */}
          <div className="absolute -inset-[1px] bg-gradient-to-r from-zinc-300 via-zinc-200 to-zinc-300 dark:from-zinc-600 dark:via-zinc-500 dark:to-zinc-600 rounded-xl opacity-40" />
          <div className="frosted-glass rounded-xl px-3 py-1.5 flex items-center justify-between relative">
            <Link href="/" className="text-sm font-semibold text-zinc-800 dark:text-zinc-300 dark:hover:text-white/80 dark:hover:text-zinc-600 dark:transition">
              Parkbeat
            </Link>
            <SettingsDialog />
          </div>
        </div>
      </div>
    </header>
  )
} 