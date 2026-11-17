export const adminRoles = ['SUPER_ADMIN', 'CONTENT_ADMIN', 'CONTENT_EDITOR', 'CONTENT_REVIEWER'] as const
export type AdminRole = (typeof adminRoles)[number]
export type DraftPermission = 'draft:read' | 'draft:write' | 'draft:delete'
export type AssetPermission = 'asset:read' | 'asset:upload'
export type PublicationPermission = 'publication:read' | 'publication:publish'
export type DeliveryPermission = 'delivery:read'
export type AdminPermission = DraftPermission | AssetPermission | PublicationPermission | DeliveryPermission

export const rolePermissions: Readonly<Record<AdminRole, ReadonlySet<AdminPermission>>> = {
  SUPER_ADMIN: new Set(['draft:read', 'draft:write', 'draft:delete', 'asset:read', 'asset:upload', 'publication:read', 'publication:publish', 'delivery:read']),
  CONTENT_ADMIN: new Set(['draft:read', 'draft:write', 'draft:delete', 'asset:read', 'asset:upload', 'publication:read', 'publication:publish', 'delivery:read']),
  CONTENT_EDITOR: new Set(['draft:read', 'draft:write', 'draft:delete', 'asset:read', 'publication:read', 'delivery:read']),
  CONTENT_REVIEWER: new Set(['draft:read', 'asset:read', 'publication:read', 'delivery:read']),
}

export function isAdminRole(value: unknown): value is AdminRole { return typeof value === 'string' && adminRoles.includes(value as AdminRole) }
export function hasPermission(role: AdminRole, permission: AdminPermission): boolean { return rolePermissions[role].has(permission) }
