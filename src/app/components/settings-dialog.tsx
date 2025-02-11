'use client'

import * as Dialog from '@radix-ui/react-dialog'
import Image from "next/image"
import { ThemeSwitcher } from './theme-switcher'
import { SignInButton, SignOutButton, UserButton, UserProfile } from '@clerk/nextjs'
import { SignedIn, SignedOut } from '@clerk/nextjs'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'

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
            <div className="flex items-center gap-2 pointer-events-none">
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
        <Dialog.Overlay className="fixed inset-0 bg-black/40 dialog-overlay" />
        <Dialog.Content 
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 dialog-content w-full max-w-md" 
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <Dialog.Title className="sr-only">Settings</Dialog.Title>
          <Dialog.Description className="sr-only">
            Adjust application settings and theme preferences
          </Dialog.Description>
          
          <div className="card frosted-glass p-[var(--content-padding)]">
            <div className="space-y-6">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-foreground">Settings</h2>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-foreground">Theme</h3>
                  <ThemeSwitcher />
                </div>
                
                <SignedIn>
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-foreground">Account</h3>
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
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}