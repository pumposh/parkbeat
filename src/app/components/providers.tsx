"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ThemeProvider } from "next-themes"
import { useState } from "react"
import { ToastProvider } from "./toast"
import { StrictMode } from "react"

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
          <ToastProvider>
            {children}
          </ToastProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </StrictMode>
  )
}
