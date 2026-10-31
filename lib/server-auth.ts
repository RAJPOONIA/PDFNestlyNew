import { NextRequest, NextResponse } from 'next/server';
import {
  SafeUserProfile,
  UserRole,
  isAdminRole,
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

const TIMEZONE_TO_COUNTRY: Record<string, { country: string; countryCode: string }> = {
  'Asia/Kolkata': { country: 'India', countryCode: 'IN' },
  'Asia/Calcutta': { country: 'India', countryCode: 'IN' },
  'America/New_York': { country: 'United States', countryCode: 'US' },
  'America/Chicago': { country: 'United States', countryCode: 'US' },
  'America/Denver': { country: 'United States', countryCode: 'US' },
  'America/Los_Angeles': { country: 'United States', countryCode: 'US' },
  'America/Toronto': { country: 'Canada', countryCode: 'CA' },
  'America/Vancouver': { country: 'Canada', countryCode: 'CA' },
  'Europe/London': { country: 'United Kingdom', countryCode: 'GB' },
  'Europe/Berlin': { country: 'Germany', countryCode: 'DE' },
  'Europe/Paris': { country: 'France', countryCode: 'FR' },
  'Europe/Rome': { country: 'Italy', countryCode: 'IT' },
  'Europe/Madrid': { country: 'Spain', countryCode: 'ES' },
  'Europe/Amsterdam': { country: 'Netherlands', countryCode: 'NL' },
  'Australia/Sydney': { country: 'Australia', countryCode: 'AU' },
  'Australia/Melbourne': { country: 'Australia', countryCode: 'AU' },
  'Asia/Tokyo': { country: 'Japan', countryCode: 'JP' },
  'Asia/Singapore': { country: 'Singapore', countryCode: 'SG' },
  'Asia/Dubai': { country: 'United Arab Emirates', countryCode: 'AE' },
  'America/Sao_Paulo': { country: 'Brazil', countryCode: 'BR' },
};

const COUNTRY_CODE_TO_NAME: Record<string, string> = {
  US: 'United States',
  IN: 'India',
  GB: 'United Kingdom',
  CA: 'Canada',
  DE: 'Germany',
  FR: 'France',
  AU: 'Australia',
  JP: 'Japan',
  SG: 'Singapore',
  AE: 'United Arab Emirates',
  BR: 'Brazil',
  NL: 'Netherlands',
  ES: 'Spain',
  IT: 'Italy',
  PK: 'Pakistan',
  BD: 'Bangladesh',
};

export function resolveClientCountry(
  req: NextRequest,
  clientHint?: { timeZone?: string; countryCode?: string }
): { country: string; countryCode: string } {
  const headerCode = (
    req.headers.get('cf-ipcountry') ||
    req.headers.get('x-vercel-ip-country') ||
    req.headers.get('x-country-code') ||
    req.headers.get('x-appengine-country') ||
    ''
  ).trim().toUpperCase();

  if (headerCode && headerCode.length === 2 && headerCode !== 'XX' && headerCode !== 'T1') {
    return {
      country: COUNTRY_CODE_TO_NAME[headerCode] || headerCode,
      countryCode: headerCode,
    };
  }

  if (clientHint?.timeZone) {
    const tzMatch = TIMEZONE_TO_COUNTRY[clientHint.timeZone];
    if (tzMatch) return tzMatch;
    if (
      clientHint.timeZone.includes('India') ||
      clientHint.timeZone.includes('Calcutta') ||
      clientHint.timeZone.includes('Kolkata')
    ) {
      return { country: 'India', countryCode: 'IN' };
    }
    if (clientHint.timeZone.startsWith('America/')) {
      return { country: 'United States', countryCode: 'US' };
    }
    if (clientHint.timeZone.startsWith('Europe/')) {
      return { country: 'United Kingdom', countryCode: 'GB' };
    }
  }

  const acceptLang = req.headers.get('accept-language') || '';
  const match = acceptLang.match(/[-_]([A-Z]{2})\b/i);
  if (match) {
    const code = match[1].toUpperCase();
    if (COUNTRY_CODE_TO_NAME[code]) {
      return { country: COUNTRY_CODE_TO_NAME[code], countryCode: code };
    }
  }

  return { country: 'United States', countryCode: 'US' };
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
  req: NextRequest,
  allowedRoles?: UserRole[]
): Promise<
  | { ok: true; admin: SafeUserProfile }
  | { ok: false; response: NextResponse }
> {
  const authCheck = await requireAuthenticatedUser(req);
  if (!authCheck.ok) {
    return authCheck;
  }

  const role = authCheck.user.role;
  const isAuthorized = isAdminRole(role) && (!allowedRoles || allowedRoles.includes(role));

  if (!isAuthorized) {
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
