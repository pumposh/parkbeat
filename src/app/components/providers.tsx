"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ThemeProvider } from "next-themes"
import { useState, useEffect } from "react"
import { ToastProvider } from "./toast"
import { StrictMode } from "react"
import { UserAvatarCacheProvider } from "./ui/user-avatar-context"
import { RemoteLoggerProvider } from "@/providers/remote-logger-provider"
import { LoggerProvider } from "@/providers/logger-provider"

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())
  
  // Ensure logger is initialized before rendering
  const [isLoggerReady, setIsLoggerReady] = useState(false)
  
  useEffect(() => {
    // Mark logger as ready on client-side
    setIsLoggerReady(true)
  }, [])

  // Only render children when logger is ready on client-side
  // This ensures the logger is initialized before any components render
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
          <LoggerProvider>
            <UserAvatarCacheProvider>
              <ToastProvider>
                <RemoteLoggerProvider>
                  {typeof window === 'undefined' || isLoggerReady ? children : null}
                </RemoteLoggerProvider>
              </ToastProvider>
            </UserAvatarCacheProvider>
          </LoggerProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </StrictMode>
  )
}
