import type { Metadata } from "next"
import { Providers } from "./components/providers"

import "./globals.css"

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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          src="https://kit.fontawesome.com/aaef78e0d5.js"
          crossOrigin="anonymous"
        />
        <script
          src="https://unpkg.com/maplibre-gl@latest/dist/maplibre-gl.js"
        />
        <link
          href="https://unpkg.com/maplibre-gl@latest/dist/maplibre-gl.css"
          rel="stylesheet"
        />
        <script dangerouslySetInnerHTML={{
          __html: `
            document.documentElement.classList.add('no-transitions');
            window.addEventListener('load', () => {
              document.documentElement.classList.remove('no-transitions');
            });
          `
        }} />
      </head>
      <body suppressHydrationWarning className="antialiased bg-background text-foreground">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
