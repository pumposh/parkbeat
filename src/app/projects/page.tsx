'use client'

import { Suspense } from "react"

function ProjectsPageContent() {
  return (
    <main>
      {/* Projects content will go here */}
    </main>
  )
}

export default function ProjectsPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ProjectsPageContent />
    </Suspense>
  )
}