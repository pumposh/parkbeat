import { Roles } from '../../types/global'
import { auth } from '@clerk/nextjs/server'

export const checkRole = async (role: Roles) => {
  const sessionClaims = await auth()
  console.log(sessionClaims)
  return sessionClaims
    && 'publicMetadata' in sessionClaims
    && 'role' in (sessionClaims.publicMetadata as any)
    && (sessionClaims.publicMetadata as any).role === role
}