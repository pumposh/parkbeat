'use client'

import { useUser } from "@clerk/nextjs"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

type FooterAction = {
  href: string
  icon: string
  label: string
  adminOnly?: boolean
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
    icon: "fa-solid fa-map-pin",
    label: "Place Tree",
    adminOnly: true
  },
  {
    href: "/",
    icon: "fa-solid fa-bell",
    label: "Activity"
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
          {/* Gradient border using pseudo-element */}
          <div className="absolute -inset-[1px] bg-gradient-to-r from-zinc-300 via-zinc-200 to-zinc-300 dark:from-zinc-600 dark:via-zinc-500 dark:to-zinc-600 rounded-xl opacity-40" />
          <nav className="frosted-glass rounded-xl px-3 py-1.5 flex items-center justify-around relative">
            {visibleActions.map((action) => (
              <Link
                key={action.href + action.label}
                href={action.href}
                className={cn(
                  "flex flex-col items-center gap-1 px-3 py-1 rounded-lg transition-colors",
                  "hover:text-zinc-600 dark:hover:text-zinc-300",
                  pathname === action.href 
                    ? "text-zinc-800 dark:text-zinc-200" 
                    : "text-zinc-500 dark:text-zinc-400"
                )}
              >
                <i className={cn(action.icon, "text-lg")} aria-hidden="true" />
                <span className="text-xs font-medium">{action.label}</span>
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </div>
  )
} 