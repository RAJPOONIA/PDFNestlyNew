export type UserRole = 'user' | 'admin' | 'super_admin' | 'support' | 'analyst';

export const ADMIN_ROLES: UserRole[] = ['super_admin', 'admin', 'support', 'analyst'];

export function isAdminRole(role?: string | null): boolean {
  if (!role) return false;
  return role === 'super_admin' || role === 'admin' || role === 'support' || role === 'analyst';
}

export function isSuperAdmin(role?: string | null, email?: string | null): boolean {
  if (email && email.trim().toLowerCase() === 'rfjatt002@gmail.com') return true;
  return role === 'super_admin' || role === 'admin';
}

export type AnalyticsTimeRange = 'today' | '7d' | '28d' | '90d' | 'lifetime' | 'custom';
