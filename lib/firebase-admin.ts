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
