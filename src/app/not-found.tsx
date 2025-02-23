'use client'

import { Suspense } from 'react'
import Link from 'next/link'

function NotFoundContent() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">404 - Page Not Found</h1>
        <p className="text-lg mb-8">The page you're looking for doesn't exist.</p>
        <Link
          href="/"
          className="text-blue-500 hover:text-blue-600 underline"
        >
          Go back home
        </Link>
      </div>
    </main>
  )
}

export default function NotFound() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <NotFoundContent />
    </Suspense>
  )
} 