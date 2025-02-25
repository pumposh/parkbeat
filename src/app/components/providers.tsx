"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ThemeProvider } from "next-themes"
import { useState } from "react"
import { ToastProvider } from "./toast"
import { StrictMode } from "react"
import { UserAvatarCacheProvider } from "./ui/user-avatar-context"

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider 
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          enableColorScheme
          storageKey="parkbeat-theme"
          themes={['light', 'dark']}
          forcedTheme={undefined}
        >
          <UserAvatarCacheProvider>
            <ToastProvider>
              {children}
            </ToastProvider>
          </UserAvatarCacheProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </StrictMode>
  )
}
