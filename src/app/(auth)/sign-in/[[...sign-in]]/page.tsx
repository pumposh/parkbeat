import { SignIn } from '@clerk/nextjs'

export default function Page() {
  return (
    <div className="w-full max-w-md">
      <SignIn />
    </div>
  )
} 