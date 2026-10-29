import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

let connectionTested = false;

export async function testFirestoreConnection(): Promise<void> {
  if (typeof window === 'undefined' || connectionTested) return;
  connectionTested = true;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('the client is offline')
    ) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

if (typeof window !== 'undefined') {
  testFirestoreConnection();
}

/**
 * Syncs an authenticated Firebase user's profile to Firestore `/users/{uid}`
 * strictly adhering to the `UserProfile` entity blueprint and `firestore.rules`.
 */
export async function syncFirebaseUserToFirestore(params: {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  provider: 'google' | 'email';
  role: 'user' | 'admin';
  emailVerified: boolean;
}): Promise<void> {
  if (!auth.currentUser || auth.currentUser.uid !== params.uid) return;
  if (!auth.currentUser.emailVerified) return;

  const cleanUid = params.uid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
  const path = `users/${cleanUid}`;
  try {
    const userRef = doc(db, 'users', cleanUid);
    const snap = await getDocFromServer(userRef);
    if (!snap.exists()) {
      await setDoc(userRef, {
        uid: cleanUid,
        email: params.email.slice(0, 254),
        displayName: (params.displayName || 'PDFNestly User').slice(0, 120),
        ...(params.photoURL ? { photoURL: params.photoURL.slice(0, 500) } : {}),
        provider: params.provider,
        role: params.role === 'admin' ? 'admin' : 'user',
        status: 'active',
        emailVerified: Boolean(params.emailVerified),
        pdfJobsCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('Missing or insufficient permissions')
    ) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }
}
