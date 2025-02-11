'use client'

import * as Dialog from '@radix-ui/react-dialog'
import Image from "next/image"
import { ThemeSwitcher } from './theme-switcher'
import { UserButton, UserProfile } from '@clerk/nextjs'
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
      router.push('/')
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>
        <button
          className="relative flex items-center justify-center w-7 h-7 hover:opacity-80 transition rounded-full"
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
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 dialog-content" onCloseAutoFocus={(e) => e.preventDefault()}>
          <Dialog.Title className="sr-only">Settings</Dialog.Title>
          <Dialog.Description className="sr-only">
            Adjust application settings and theme preferences
          </Dialog.Description>
          
          <div className="p-6 rounded-2xl frosted-glass shadow-lg">
            <div className="space-y-3">
              <div className="px-1">
                <ThemeSwitcher />
              </div>
              <SignedIn>
                <div className="px-1">
                  <UserProfile routing="hash" />
                </div>
              </SignedIn>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}