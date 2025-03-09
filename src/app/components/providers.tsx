"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ThemeProvider } from "next-themes"
import { useState, useEffect } from "react"
import { ToastProvider } from "./toast"
import { UserAvatarCacheProvider } from "./ui/user-avatar-context"
// import { RemoteLoggerProvider } from "@/providers/remote-logger-provider"

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())

  // Only render children when logger is ready on client-side
  // This ensures the logger is initialized before any components render
  return (
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
              <div id="providers-children">
                {children}
              </div>
            </ToastProvider>
          </UserAvatarCacheProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
