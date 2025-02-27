'use client'

import { useUser } from "@clerk/nextjs"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { useState, useEffect } from "react"
import { SettingsDialog } from "../settings-dialog"
import { UserButton } from "@clerk/nextjs"

type FooterAction = {
  href?: string
  icon: string
  label: string
  adminOnly?: boolean
  component?: React.ReactNode
}

const footerActions: FooterAction[] = [
  {
    href: "/posts",
    icon: "fa-solid fa-comments",
    label: "Posts"
  },
  {
    href: "/projects",
    icon: "fa-solid fa-tree-city",
    label: "Projects",
  },
  {
    href: "/notifications",
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

export const FooterMenu = () => {
  const { user } = useUser()
  const pathname = usePathname()

  const isAdmin = user?.organizationMemberships?.some(
    (membership) => membership.role === "org:admin"
  )

  const visibleActions = footerActions.filter(action => 
    !action.adminOnly || (action.adminOnly && isAdmin)
  )

  return (
    <div className="fixed bottom-0 left-0 right-0 parkbeat-footer" style={{ zIndex: 'var(--z-header)' }}>
      <div className="mx-auto px-3 py-1.5">
        <div className="relative">
          <nav className="frosted-glass rounded-2xl px-3 py-1.5 flex items-center justify-around relative">
            {visibleActions.map((action) => (
              action.component ? (
                <div
                  key={action.label}
                  className={cn(
                    "flex flex-col items-center gap-1 px-3 py-1 rounded-lg transition-colors",
                    "hover:text-zinc-600 dark:hover:text-zinc-300",
                    "text-zinc-700 dark:text-zinc-400"
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
                    pathname === action.href 
                      ? "text-black/80 dark:text-white/80 bg-white/30 dark:bg-black/30 shadow-xl" 
                      : "text-zinc-600 dark:text-zinc-100"
                  )}
                >
                  <i className={cn(action.icon, "text-lg")} aria-hidden="true" />
                  <span className="font-light font-display tracking-wide text-[10px]">{action.label}</span>
                </Link>
              )
            ))}
          </nav>
        </div>
      </div>
    </div>
  )
} 