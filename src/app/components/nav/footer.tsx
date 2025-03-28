'use client'

import Link from "next/link"
import { cn } from "@/lib/utils"
import { SettingsDialog } from "../settings-dialog"
import FooterIndicator from "./footer-indicator"

export type FooterAction = {
  href?: string
  icon: string
  label: string
  adminOnly?: boolean
  component?: React.ReactNode
}

const footerActions: FooterAction[] = [
  {
    href: "/posts",
    icon: "fa-solid fa-house",
    label: "Home"
  },
  {
    href: "/projects",
    icon: "fa-solid fa-tree-city",
    label: "Projects",
  },
  {
    href: "/updates",
    icon: "fa-solid fa-bell",
    label: "Updates"
  },
  {
    href: "/settings",
    icon: "fa-solid fa-gear",
    label: "Settings",
    component: <SettingsDialog className="ring-[1.5px] ring-white/50 dark:ring-gray-800/50 shadow-xl" />
  }
]

// Using memo to prevent unnecessary re-renders
export default function FooterMenu({ pathname = '/' }: { pathname?: string }) {
  const isAdmin = false;

  const visibleActions = footerActions.filter(action => 
    !action.adminOnly || (action.adminOnly && isAdmin)
  )

  console.log('[Footer] pathname', pathname, visibleActions.map(action => action.href))

  return (
    <div id="footer" className="parkbeat-footer" style={{ zIndex: 'var(--z-header)' }}>
      <div className="mx-auto px-3 pb-1.5">
        <div className="relative">
          <nav className="frosted-glass rounded-2xl px-3 py-1.5 flex items-center justify-around relative">
            {visibleActions.map((action, index) => (
              action.component ? (
                <div
                  key={action.label}
                  className={cn(
                    "flex flex-col items-center gap-1 px-3 py-1 rounded-lg transition-colors",
                    "hover:text-zinc-600 dark:hover:text-zinc-300",
                    "text-zinc-700 dark:text-zinc-300",
                    "z-10 relative"
                  )}
                >
                  {action.component}
                </div>
              ) : (
                <Link
                  key={action.href + action.label}
                  href={action.href!}
                  className={cn(
                    "flex flex-col items-center gap-1 px-3 py-1 rounded-lg transition-colors",
                    "hover:text-zinc-600 dark:hover:text-zinc-300",
                    "z-10 relative",
                    "text-zinc-600 dark:text-zinc-300"
                  )}
                >
                  <i 
                    className={cn(
                      action.icon, 
                      "text-lg transition-all",
                    )} 
                    aria-hidden="true" 
                  />
                  <span 
                    className={cn(
                      "font-light font-display tracking-wide text-[10px] transition-all",
                    )}
                  >
                    {action.label}
                  </span>
                </Link>
              )
            ))}
            <FooterIndicator visibleActions={visibleActions} />
          </nav>
        </div>
      </div>
    </div>
  )
} 