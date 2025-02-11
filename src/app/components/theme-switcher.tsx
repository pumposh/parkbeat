'use client'

import { useState, useEffect } from 'react'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'

interface ThemeSwitcherProps {
  onClose?: () => void
}

export const ThemeSwitcher = ({ onClose }: ThemeSwitcherProps) => {
  const [mounted, setMounted] = useState(false)
  const { setTheme, theme = 'system' } = useTheme()

  useEffect(() => setMounted(true), [])

  if (!mounted) {
    return <div className="w-40 h-8 rounded-full bg-zinc-100/50 dark:bg-white/10" />
  }

  return (
    <div className="relative w-40 h-8">
      <div className="absolute inset-0 rounded-full frosted-glass bg-white/40 dark:bg-zinc-800/90">
        <div 
          className="absolute h-7 w-[32%] rounded-full bg-white/60 dark:bg-zinc-800/90 shadow-sm transition-transform duration-200"
          style={{ 
            top: 2,
            left: 2,
            transform: `translateX(${theme === 'system' ? 'calc(100% + 2px)' : theme === 'dark' ? 'calc(200% + 2px)' : 0})`
          }}
        />
      </div>

      <div className="relative grid h-full grid-cols-3">
        {[
          { value: 'light', icon: 'fa-sun' },
          { value: 'system', icon: 'fa-desktop' },
          { value: 'dark', icon: 'fa-moon' }
        ].map(({ value, icon }) => (
          <button
            key={value}
            onClick={() => {
              setTheme(value)
              onClose?.()
            }}
            className={cn(
              "flex items-center justify-center",
              theme === value ? "text-zinc-900 dark:text-white" : "text-zinc-800 dark:text-zinc-400"
            )}
          >
            <i className={`fa-solid ${icon} w-4 h-4`} aria-hidden="true" />
            <span className="sr-only">{value} theme</span>
          </button>
        ))}
      </div>
    </div>
  )
} 