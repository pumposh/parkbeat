'use client'

import * as Dialog from '@radix-ui/react-dialog'
import Image from "next/image"
import { ThemeSwitcher } from './theme-switcher'

export const SettingsDialog = () => {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button
          className="relative flex items-center justify-center w-7 h-7 hover:opacity-80 transition rounded-full"
          style={{ backgroundColor: '#F2F0E630' }}
        >
          <Image
            src="/parkbeat.png"
            alt="Settings"
            width={18}
            height={18}
            className="object-contain brightness-110 dark:brightness-125"
            priority
          />
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
              <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                Theme
              </div>
              <div className="px-1">
                <ThemeSwitcher />
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}