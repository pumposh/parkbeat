import { SignIn } from '@clerk/nextjs'
import { redirect } from 'next/navigation'
import { currentUser } from '@clerk/nextjs/server'
import Autosize from '@/app/components/ui/autosize'
import { Logo } from '@/app/components/ui/logo'

export default async function SignInPage() {
  // Check if user is authenticated
  const user = await currentUser()
  
  // If user is authenticated, redirect to projects
  if (user) {
    redirect('/projects')
  }
  
  // Otherwise, show the sign-in component
  return (
    <div className="h-full flex items-center justify-center">
        <Autosize className="w-full max-w-md frosted-glass" observeParent={true} observeChildren={true} anchorX="center" anchorY="start">
          <div className="flex items-center flex-col justify-center min-w-fit">
            <div className="p-12 pb-8">
              <Logo />
            </div>
            <p className="text-2xl font-large font-display opacity-80">Parkbeat</p>
            <p className="text-sm font-medium font-display opacity-40 pb-6">Sign in to your account</p>
            <SignIn />
          </div>
        </Autosize>
    </div>
  )
}