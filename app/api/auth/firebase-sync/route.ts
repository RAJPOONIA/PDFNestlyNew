import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseIdToken } from '@/lib/firebase-admin';
import {
  syncFirebaseAuthenticatedUser,
  checkRateLimit,
} from '@/lib/platform-store';
import { attachSessionCookie, getClientIp } from '@/lib/server-auth';

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rate = checkRateLimit(`firebase_sync:${ip}`, 30);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait before retrying.' },
        { status: 429 }
      );
    }

    const body = await req.json();
    const idToken = String(body.idToken || '');
    if (!idToken) {
      return NextResponse.json(
        { error: 'Missing Firebase ID token.' },
        { status: 400 }
      );
    }

    const decoded = await verifyFirebaseIdToken(idToken);
    if (!decoded || !decoded.email) {
      return NextResponse.json(
        { error: 'Invalid or expired Firebase ID token.' },
        { status: 401 }
      );
    }

    const provider =
      decoded.firebase?.sign_in_provider === 'password' ? 'email' : 'google';

    const synced = syncFirebaseAuthenticatedUser({
      uid: decoded.uid,
      email: decoded.email,
      displayName:
        body.displayName || decoded.name || decoded.email.split('@')[0],
      photoURL: body.photoURL || decoded.picture || '',
      provider,
      emailVerified: Boolean(decoded.email_verified),
      userAgent: req.headers.get('user-agent') || 'Browser',
      ip,
    });

    const res = NextResponse.json({
      user: synced.user,
      sessionToken: synced.sessionToken,
      isNewUser: synced.isNewUser,
    });

    return attachSessionCookie(res, synced.sessionToken);
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : 'Failed to synchronize Firebase user session.';
    const status = message.toLowerCase().includes('suspended') ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
