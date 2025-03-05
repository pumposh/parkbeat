

import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
const isProtectedRoute = createRouteMatcher(['/posts(.*)', '/projects(.*)', '/settings(.*)'])
export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect()
  }
  
  const pathname = req.nextUrl.pathname
  console.log(pathname)
  
  return NextResponse.next()
})



export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)",
  ],
};