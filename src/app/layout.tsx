import type { Metadata } from "next"
import { Providers } from "./components/providers"
import { ClerkProvider } from "@clerk/nextjs"
import { Bree_Serif } from "next/font/google"
import { Suspense } from "react"
import { MapController } from "./components/map-controller/index"

import "./globals.css"
import "./components/ui/variables.css"
import React from "react"
import { FloatingDebugControl } from './components/dev'
import { cn } from "@/lib/utils"

const breeSerif = Bree_Serif({ 
  subsets: ['latin'],
  display: 'block',
  variable: '--font-display',
  weight: '400'
})

export const metadata: Metadata = {
  title: "Parkbeat",
  description: "Share your thoughts with Parkbeat - Real-time social updates",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <React.StrictMode>
      <ClerkProvider>
        {/* ClerkProvider is required at the app level for authentication to work properly */}
        <html lang="en" suppressHydrationWarning className={breeSerif.variable}>
        <head>
        <link
          rel="preload"
          href="/parkbeat.svg"
          as="image"
          type="image/svg+xml"
          fetchPriority="high"
        />
        <link
          rel="preload"
          href="/mask-no-background.png"
          as="image"
          type="image/png"
          fetchPriority="high"
        />
        <script
          src="https://kit.fontawesome.com/aaef78e0d5.js"
          crossOrigin="anonymous"
        />
      </head>
      <body className="antialiased fixed bg-background text-foreground h-[100dvh] overflow-hidden max-w-[100dvw]">
        <Providers>
          <Suspense fallback={<div>Loading map...</div>}>
            <MapController />
          </Suspense>
          {/* Container for page content */}
          <div className={cn(
              "root-layout-container",
              "fixed flex flex-col items-center inset-0 pointer-events-none",
              "z-content",
            )}
              style={{ zIndex: 'var(--z-content)' }}
            >
            {children}
          </div>
          {(
            <>
              <FloatingDebugControl />
            </>
          )}
        </Providers>
        </body>
      </html>
    </ClerkProvider>
    </React.StrictMode>
  )
}
