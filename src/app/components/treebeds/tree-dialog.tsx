'use client'

import { useRouter } from 'next/navigation'
import { PlaceTreeForm } from './place-tree-form'
import { cn } from '@/lib/utils'
import * as Dialog from '@radix-ui/react-dialog'
import { useState } from 'react'

export function TreeDialog(props: {
  lat?: number
  lng?: number
}) {
  const router = useRouter()
  const [open, setOpen] = useState(true)

  return (
    <Dialog.Root 
      open={open} 
      onOpenChange={(isOpen) => {
        setOpen(isOpen)
        if (!isOpen) {
          // Wait for the animation to complete
          setTimeout(() => {
            router.back()
          }, 150)
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0" />
        <Dialog.Content className="dialog-content fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl p-4 overflow-visible">
          <div className="pointer-events-auto">
            <div className="frosted-glass rounded-2xl p-8 relative">
              <div className="flex flex-col gap-6">
                <div className="flex items-center gap-3">
                  <i className="fa-solid fa-map-pin text-xl text-zinc-800 dark:text-zinc-200" aria-hidden="true" />
                  <Dialog.Title className={cn(
                    "text-xl font-semibold",
                    "text-zinc-900 dark:text-zinc-200"
                  )}>
                    Place a tree bed
                  </Dialog.Title>
                </div>
                <PlaceTreeForm lat={props.lat} lng={props.lng}  />
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
} 