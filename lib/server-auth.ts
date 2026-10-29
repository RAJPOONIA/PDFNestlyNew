import { NextRequest, NextResponse } from 'next/server';
import {
  SafeUserProfile,
  getSessionCookieName,
  validateSessionToken,
  syncFirebaseAuthenticatedUser,
  checkRateLimit,
} from './platform-store';
import { verifyFirebaseIdToken } from './firebase-admin';

export function getClientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    return xff.split(',')[0].trim();
  }
  return req.headers.get('x-real-ip') || '127.0.0.1';
}

export function extractAuthToken(req: NextRequest): string | null {
  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }
  const cookieToken = req.cookies.get(getSessionCookieName())?.value;
  if (cookieToken) return cookieToken;
  return null;
}

export async function resolveAuthenticatedUser(
  req: NextRequest
): Promise<{ user: SafeUserProfile; sessionToken?: string } | null> {
  const token = extractAuthToken(req);
  if (!token) return null;

  // 1. Check signed PDFNestly server session token first
  const sessionMatch = validateSessionToken(token);
  if (sessionMatch) {
    return { user: sessionMatch.user, sessionToken: token };
  }

  // 2. Fallback: Check if token is a Firebase ID token
  const firebaseDecoded = await verifyFirebaseIdToken(token);
  if (firebaseDecoded && firebaseDecoded.email) {
    const provider =
      firebaseDecoded.firebase?.sign_in_provider === 'password'
        ? 'email'
        : 'google';
    try {
      const synced = syncFirebaseAuthenticatedUser({
        uid: firebaseDecoded.uid,
        email: firebaseDecoded.email,
        displayName: firebaseDecoded.name || firebaseDecoded.email.split('@')[0],
        photoURL: firebaseDecoded.picture || '',
        provider,
        emailVerified: Boolean(firebaseDecoded.email_verified),
        userAgent: req.headers.get('user-agent') || 'Browser',
        ip: getClientIp(req),
      });
      return { user: synced.user, sessionToken: synced.sessionToken };
    } catch {
      return null;
    }
  }

  return null;
}

export async function requireAuthenticatedUser(
  req: NextRequest
): Promise<
  | { ok: true; user: SafeUserProfile }
  | { ok: false; response: NextResponse }
> {
  const ip = getClientIp(req);
  const rate = checkRateLimit(`api:${ip}`);
  if (!rate.allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Rate limit exceeded. Please try again shortly.' },
        {
          status: 429,
          headers: { 'Retry-After': String(rate.retryAfterSeconds) },
        }
      ),
    };
  }

  const resolved = await resolveAuthenticatedUser(req);
  if (!resolved) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Authentication required. Please sign in to continue.' },
        { status: 401 }
      ),
    };
  }

  if (resolved.user.status === 'suspended') {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            'Your account has been suspended by an administrator. Access denied.',
        },
        { status: 403 }
      ),
    };
  }

  return { ok: true, user: resolved.user };
}

export async function requireAdminUser(
  req: NextRequest
): Promise<
  | { ok: true; admin: SafeUserProfile }
  | { ok: false; response: NextResponse }
> {
  const authCheck = await requireAuthenticatedUser(req);
  if (!authCheck.ok) {
    return authCheck;
  }

  if (authCheck.user.role !== 'admin') {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            'Forbidden: Administrator privileges are required to access this resource.',
        },
        { status: 403 }
      ),
    };
  }

  return { ok: true, admin: authCheck.user };
}

export function attachSessionCookie(
  res: NextResponse,
  sessionToken: string
): NextResponse {
  res.cookies.set({
    name: getSessionCookieName(),
    value: sessionToken,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  });
  return res;
}

export function clearSessionCookie(res: NextResponse): NextResponse {
  res.cookies.set({
    name: getSessionCookieName(),
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return res;
}
