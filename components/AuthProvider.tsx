'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from 'react';
import { usePathname } from 'next/navigation';
import {
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { AlertTriangle } from 'lucide-react';
import {
  auth,
  googleProvider,
  syncFirebaseUserToFirestore,
} from '@/lib/firebase';
import { trackPdfActivity } from '@/lib/activity-client';

export interface ClientUserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  provider: 'google' | 'email';
  role: 'user' | 'admin';
  status: 'active' | 'suspended';
  emailVerified: boolean;
  pdfJobsCount: number;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  lastActiveAt: string | null;
}

export interface PublicPlatformSettings {
  registrationEnabled: boolean;
  googleAuthEnabled: boolean;
  emailAuthEnabled: boolean;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  maxUploadSizeMb: number;
}

interface AuthContextValue {
  user: ClientUserProfile | null;
  isLoading: boolean;
  settings: PublicPlatformSettings;
  loginWithGoogle: () => Promise<ClientUserProfile>;
  loginWithEmail: (email: string, password: string) => Promise<ClientUserProfile>;
  registerWithEmail: (params: {
    email: string;
    password: string;
    displayName: string;
  }) => Promise<{
    user: ClientUserProfile;
    emailSent?: boolean;
    emailDeliveryConfigured?: boolean;
    message?: string;
  }>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<ClientUserProfile | null>;
}

const DEFAULT_SETTINGS: PublicPlatformSettings = {
  registrationEnabled: true,
  googleAuthEnabled: true,
  emailAuthEnabled: true,
  maintenanceMode: false,
  maintenanceMessage: '',
  maxUploadSizeMb: 50,
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  settings: DEFAULT_SETTINGS,
  loginWithGoogle: async () => {
    throw new Error('AuthProvider not initialized');
  },
  loginWithEmail: async () => {
    throw new Error('AuthProvider not initialized');
  },
  registerWithEmail: async () => {
    throw new Error('AuthProvider not initialized');
  },
  logout: async () => {},
  refreshSession: async () => null,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<ClientUserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [settings, setSettings] =
    useState<PublicPlatformSettings>(DEFAULT_SETTINGS);
  const pathname = usePathname();
  const lastTrackedPageRef = useRef<string | null>(null);

  const refreshSession = useCallback(async (): Promise<ClientUserProfile | null> => {
    try {
      const res = await fetch('/api/auth/session', {
        method: 'GET',
        cache: 'no-store',
      });
      if (!res.ok) {
        setUser(null);
        return null;
      }
      const data = await res.json();
      if (data.settings) {
        setSettings(data.settings);
      }
      setUser(data.user || null);
      return data.user || null;
    } catch {
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSession();

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser && fbUser.email) {
        try {
          const idToken = await fbUser.getIdToken();
          const res = await fetch('/api/auth/firebase-sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              idToken,
              displayName: fbUser.displayName || undefined,
              photoURL: fbUser.photoURL || undefined,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.user) {
              setUser(data.user);
              await syncFirebaseUserToFirestore({
                uid: fbUser.uid,
                email: fbUser.email,
                displayName: data.user.displayName,
                photoURL: data.user.photoURL,
                provider: data.user.provider,
                role: data.user.role,
                emailVerified: Boolean(fbUser.emailVerified),
              }).catch(() => {});
            }
          }
        } catch {
          // Ignore background Firebase sync error if offline
        }
      }
    });

    return () => unsubscribe();
  }, [refreshSession]);

  // Track page_viewed in platform activity tracker (deduplicated per pathname)
  useEffect(() => {
    if (!pathname) return;
    if (lastTrackedPageRef.current === pathname) return;
    lastTrackedPageRef.current = pathname;

    trackPdfActivity({
      eventType: 'page_viewed',
      pagePath: pathname,
      status: 'info',
    }).catch(() => {});
  }, [pathname]);

  const loginWithGoogle = useCallback(async (): Promise<ClientUserProfile> => {
    const credential = await signInWithPopup(auth, googleProvider);
    const fbUser = credential.user;
    const idToken = await fbUser.getIdToken();

    const res = await fetch('/api/auth/firebase-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idToken,
        displayName: fbUser.displayName || undefined,
        photoURL: fbUser.photoURL || undefined,
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.user) {
      throw new Error(data.error || 'Google sign-in synchronization failed.');
    }

    setUser(data.user);

    await syncFirebaseUserToFirestore({
      uid: fbUser.uid,
      email: fbUser.email || data.user.email,
      displayName: data.user.displayName,
      photoURL: data.user.photoURL,
      provider: 'google',
      role: data.user.role,
      emailVerified: Boolean(fbUser.emailVerified),
    }).catch(() => {});

    return data.user;
  }, []);

  const loginWithEmail = useCallback(
    async (email: string, password: string): Promise<ClientUserProfile> => {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.user) {
        throw new Error(data.error || 'Invalid email or password.');
      }
      setUser(data.user);
      return data.user;
    },
    []
  );

  const registerWithEmail = useCallback(
    async (params: {
      email: string;
      password: string;
      displayName: string;
    }) => {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await res.json();
      if (!res.ok || !data.user) {
        throw new Error(data.error || 'Account registration failed.');
      }
      setUser(data.user);
      return {
        user: data.user as ClientUserProfile,
        emailSent: Boolean(data.emailSent),
        emailDeliveryConfigured: Boolean(data.emailDeliveryConfigured),
        message: data.message as string | undefined,
      };
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore network errors
    }
    try {
      if (auth.currentUser) {
        await firebaseSignOut(auth);
      }
    } catch {
      // Ignore Firebase signout error
    }
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        settings,
        loginWithGoogle,
        loginWithEmail,
        registerWithEmail,
        logout,
        refreshSession,
      }}
    >
      {settings.maintenanceMode && (
        <div
          role="status"
          className="bg-amber-500/15 border-b border-amber-500/30 text-amber-900 dark:text-amber-200 px-4 py-2 text-xs font-medium flex items-center justify-center gap-2 text-center"
        >
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <span>{settings.maintenanceMessage}</span>
        </div>
      )}
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
