import { ReactNode } from 'react'
import { Header } from '../components/nav/header'
import FooterMenu from '../components/nav/footer'
import { currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

// Client component for the layout to prevent re-renders
export default async function AuthenticatedLayout({
  children,
}: {
  children: ReactNode,
}) {
  const user = await currentUser()

  // If not authenticated, redirect to welcome page
  if (!user) {
    redirect('/welcome')
  }

  return (
    <>
      <Header key="header" />
      <div className="fixed bottom-0 left-0 right-0 flex-1 overflow-hidden flex flex-col">
      {children}
      <FooterMenu />
      </div>
    </>
  )
} 