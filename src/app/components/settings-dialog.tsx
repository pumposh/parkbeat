'use client'

import * as Dialog from '@radix-ui/react-dialog'
import Image from "next/image"
import { ThemeSwitcher } from './theme-switcher'
import { SignInButton, SignOutButton, UserButton, UserProfile } from '@clerk/nextjs'
import { SignedIn, SignedOut } from '@clerk/nextjs'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

export const SettingsDialog = () => {
  const router = useRouter()
  const pathname = usePathname()
  const isSettingsRoute = pathname === '/settings'

  // Dialog is open when we're on the settings route
  const [open, setOpen] = useState(isSettingsRoute)

  // Sync dialog state with URL
  useEffect(() => {
    setOpen(isSettingsRoute)
  }, [isSettingsRoute])

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen)
    
    // Only push to history when the route doesn't match the dialog state
    if (isOpen && !isSettingsRoute) {
      router.push('/settings')
    } else if (!isOpen && isSettingsRoute) {
      router.back()
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>
        <button
          className="btn btn-ghost relative flex items-center justify-center w-7 h-7 rounded-full"
          style={{ backgroundColor: '#F2F0E630' }}
        >
          <SignedIn>
            <div className="flex items-center gap-2 pointer-events-none scale-[140%] outline-4 outline-white rounded-full">
              <UserButton />
            </div>
          </SignedIn>
          <SignedOut>
            <Image
              src="/parkbeat.png"
              alt="Settings"
              width={18}
              height={18}
              className="object-contain brightness-110 dark:brightness-125"
              priority
            />
          </SignedOut>
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0" />
        <Dialog.Content className="dialog-content fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md p-4 overflow-visible">
          <div className="pointer-events-auto">
            <div className={cn(
              "frosted-glass p-8 relative",
              "rounded-t-2xl md:rounded-2xl" // Only rounded at top on mobile, fully rounded on desktop
            )}>
              <div className="flex flex-col gap-6">
                <div className="flex items-center gap-3">
                  <i className="fa-solid fa-gear text-xl text-zinc-800 dark:text-zinc-200" aria-hidden="true" />
                  <Dialog.Title className={cn(
                    "text-xl font-semibold",
                    "text-zinc-900 dark:text-zinc-200"
                  )}>
                    Settings
                  </Dialog.Title>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Theme</h3>
                    <ThemeSwitcher />
                  </div>
                  
                  <SignedIn>
                    <div className="space-y-2">
                      <div className="px-1">
                        <UserProfile routing="hash" />
                      </div>
                    </div>
                    <SignOutButton>
                      <button className="w-full rounded-lg frosted-glass focus-visible:outline-none focus-visible:ring-zinc-300 dark:focus-visible:ring-zinc-100 hover:ring-zinc-300 dark:hover:ring-zinc-100 h-12 px-10 py-3 text-zinc-800 dark:text-zinc-100 font-medium transition hover:bg-white/90 dark:hover:bg-black/60">
                        Sign out
                      </button>
                    </SignOutButton>
                  </SignedIn>
                  <SignedOut>
                    <SignInButton forceRedirectUrl={'/'}>
                      <button className="w-full rounded-lg frosted-glass focus-visible:outline-none focus-visible:ring-zinc-300 dark:focus-visible:ring-zinc-100 hover:ring-zinc-300 dark:hover:ring-zinc-100 h-12 px-10 py-3 text-zinc-800 dark:text-zinc-100 font-medium transition hover:bg-white/90 dark:hover:bg-black/60">
                        Sign in
                      </button>
                    </SignInButton>
                  </SignedOut>
                </div>
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}