import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth, type Auth, type DecodedIdToken } from 'firebase-admin/auth';
import firebaseConfig from '../firebase-applet-config.json';

let cachedAdminAuth: Auth | null = null;

export function getAdminAuth(): Auth {
  if (!cachedAdminAuth) {
    if (!getApps().length) {
      initializeApp({
        projectId: firebaseConfig.projectId,
      });
    }
    cachedAdminAuth = getAuth();
  }
  return cachedAdminAuth;
}

export async function verifyFirebaseIdToken(
  idToken: string
): Promise<DecodedIdToken | null> {
  if (!idToken || typeof idToken !== 'string') return null;
  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken);
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Best-effort synchronization of a password reset with Firebase Authentication.
 * If the account also exists in Firebase Auth and the server has Admin credentials,
 * updates the Firebase Auth password and revokes existing refresh tokens so both
 * authentication stores remain consistent.
 */
export async function syncFirebaseUserPasswordAndRevokeSessions(
  email: string,
  newPassword: string
): Promise<boolean> {
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanEmail || !newPassword) return false;
  try {
    const adminAuth = getAdminAuth();
    const fbUser = await adminAuth.getUserByEmail(cleanEmail);
    if (!fbUser?.uid) return false;
    await adminAuth.updateUser(fbUser.uid, { password: newPassword });
    await adminAuth.revokeRefreshTokens(fbUser.uid);
    return true;
  } catch {
    return false;
  }
}

