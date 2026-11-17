import { getAuth } from 'firebase-admin/auth'

import { hasPermission, isAdminRole, type AdminRole, type AdminPermission } from '../auth/permissions.js'

export type VerifiedAdmin = { uid: string; role: AdminRole }
export interface TokenVerifier { verify(token: string): Promise<{ uid: string; adminRole?: unknown }> }

export class AuthenticationError extends Error { constructor(message: string) { super(message); this.name = 'AuthenticationError' } }
export class AuthorizationError extends Error { constructor(message: string) { super(message); this.name = 'AuthorizationError' } }

export async function authenticateAdmin(authorization: string | undefined, permission: AdminPermission, verifier: TokenVerifier): Promise<VerifiedAdmin> {
  const match = authorization?.match(/^Bearer\s+(.+)$/i)
  if (!match?.[1]) throw new AuthenticationError('A valid Bearer token is required')
  let claims: { uid: string; adminRole?: unknown }
  try { claims = await verifier.verify(match[1]) } catch { throw new AuthenticationError('The authentication token is invalid or expired') }
  if (!isAdminRole(claims.adminRole)) throw new AuthorizationError('A recognized adminRole claim is required')
  if (!hasPermission(claims.adminRole, permission)) throw new AuthorizationError('This admin role does not have permission for this operation')
  return { uid: claims.uid, role: claims.adminRole }
}

export const firebaseTokenVerifier: TokenVerifier = { async verify(token) { const decoded = await getAuth().verifyIdToken(token, true); return { uid: decoded.uid, adminRole: decoded.adminRole } } }
