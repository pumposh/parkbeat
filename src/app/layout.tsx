import type { Metadata } from "next"
import { Providers } from "./components/providers"
import { ClerkProvider } from "@clerk/nextjs"
import { Header } from "./components/nav/header"
import { MapController } from "./components/map-controller/index"
import { FooterMenu } from "./components/nav/footer"
import { Bree_Serif } from "next/font/google"
import { Suspense } from "react"

import "./globals.css"
import "./components/ui/variables.css"
import React from "react"
import { FloatingDebugControl } from './components/dev'

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
        <html lang="en" suppressHydrationWarning className={breeSerif.variable}>
          <head>
          {/* <link
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
          /> */}
          <script
            src="https://kit.fontawesome.com/aaef78e0d5.js"
            crossOrigin="anonymous"
          />
        </head>
        <body suppressHydrationWarning className="antialiased fixed bg-background text-foreground h-[100dvh] overflow-hidden max-w-[100dvw]">
          <Providers>
            <Suspense fallback={<div>Loading map...</div>}>
              <MapController />
            </Suspense>
            <Header />
            <div className="root-layout-container fixed flex flex-col items-center inset-x-0 bottom-0 pointer-events-none pb-[2.5rem]" style={{ zIndex: 'var(--z-content)' }}>
              {children}
            </div>
            <FooterMenu />
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
