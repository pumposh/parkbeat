import { redirect } from "next/navigation"
import { currentUser } from "@clerk/nextjs/server"
import { WelcomeGuide } from "@/app/components/welcome/welcome"

export default async function WelcomePage() {
  // Check if user is authenticated
  const user = await currentUser()
  
  // If user is authenticated, redirect to projects
  if (user) {
    redirect("/projects")
  }
  
  // Otherwise, show the welcome guide
  return (
    <div className="WelcomePage h-full flex items-center justify-center">
      <div className="w-full max-w-md">
        <main className="p-4 pb-8 w-full max-w-md mx-auto h-screen flex items-center justify-center pointer-events-auto">
          <WelcomeGuide />
        </main>
      </div>
    </div>
  )
}
