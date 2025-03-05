import { ReactNode } from 'react'
import { Header } from '../components/nav/header'
import FooterMenu from '../components/nav/footer'
import { currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { Loading } from '../components/ui/loading'
import { headers } from 'next/headers';

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

  const headersList = await headers()
  const url = headersList.get('x-url')?.replace(process.env.NEXT_PUBLIC_APP_URL ?? '', '')
  const [base, ...path] = url?.split('/') ?? []
  const pathname = path.join('/')
  console.log(pathname)
  return (
    <>
      <Header key="header" />
      <div className="fixed bottom-0 left-0 right-0 flex-1 overflow-hidden flex flex-col">
      {children}
      <FooterMenu key="footer-menu" pathname={pathname} />
      </div>
    </>
  )
} 