'use client'

import { useUser } from "@clerk/nextjs"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { useState, useEffect } from "react"
import { SettingsDialog } from "./settings-dialog"
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
    href: "/",
    icon: "fa-solid fa-compass",
    label: "Explore"
  },
  {
    href: "/manage-trees",
    icon: "fa-solid fa-tree-city",
    label: "Admin",
    adminOnly: true
  },
  {
    icon: "fa-solid fa-gear",
    label: "Settings",
    component: <SettingsDialog />
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
                      ? "text-zinc-600 dark:text-zinc-300 bg-zinc-300/50 dark:bg-zinc-800/50" 
                      : "text-zinc-700 dark:text-zinc-100"
                  )}
                >
                  <i className={cn(action.icon, "text-lg")} aria-hidden="true" />
                  <span className="text-xs font-medium">{action.label}</span>
                </Link>
              )
            ))}
          </nav>
        </div>
      </div>
    </div>
  )
} 