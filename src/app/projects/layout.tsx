import type { PropsWithChildren } from 'react'
import { currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

export default async function PlaceTreeLayout({ children }: PropsWithChildren) {
  const user = await currentUser()  
  console.log(user)

  return children;
}