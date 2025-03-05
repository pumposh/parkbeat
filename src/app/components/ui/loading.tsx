'use client'

import { cn } from "@/lib/utils"

interface LoadingProps {
  message?: string
  className?: string
}

export const Loading = ({ message = "Loading...", className }: LoadingProps) => {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center h-full w-full",
      "text-zinc-700 dark:text-zinc-300",
      className
    )}>
      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-zinc-700 dark:border-zinc-300 mb-2"></div>
      <p className="text-sm font-light">{message}</p>
    </div>
  )
} 