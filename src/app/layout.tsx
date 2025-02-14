import type { Metadata } from "next"
import { Providers } from "./components/providers"
import { ClerkProvider } from "@clerk/nextjs"
import { Header } from "./components/nav/header"
import { MapController } from "./components/map-controller/index"
import { FooterMenu } from "./components/nav/footer"
import { Newsreader } from "next/font/google"

import "./globals.css"

const newsreader = Newsreader({ 
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-display'
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
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning className={newsreader.variable}>
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
        <body suppressHydrationWarning className="antialiased bg-background text-foreground">
          <Providers>
            <MapController />
            <Header />
            <div className="root-layout-container fixed flex flex-col items-center inset-x-0 bottom-0 pointer-events-none pb-[2.5rem]" style={{ zIndex: 'var(--z-content)' }}>
              {children}
            </div>
            <FooterMenu />
          </Providers>
        </body>
      </html>
    </ClerkProvider>
  )
}
