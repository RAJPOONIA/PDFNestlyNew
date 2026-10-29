import { NextRequest, NextResponse } from 'next/server';
import { registerEmailUser, checkRateLimit } from '@/lib/platform-store';
import { attachSessionCookie, getClientIp } from '@/lib/server-auth';

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rate = checkRateLimit(`register:${ip}`, 15);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Too many registration attempts. Please wait a minute and try again.' },
        {
          status: 429,
          headers: { 'Retry-After': String(rate.retryAfterSeconds) },
        }
      );
    }

    const body = await req.json();
    const email = String(body.email || '');
    const password = String(body.password || '');
    const displayName = String(body.displayName || '');

    const result = registerEmailUser({
      email,
      password,
      displayName,
      userAgent: req.headers.get('user-agent') || 'Browser',
      ip,
    });

    const verificationUrl = `/verify-email?uid=${encodeURIComponent(
      result.user.uid
    )}&token=${encodeURIComponent(result.verificationToken)}`;

    const res = NextResponse.json(
      {
        user: result.user,
        sessionToken: result.sessionToken,
        verificationToken: result.verificationToken,
        verificationUrl,
        message: result.user.emailVerified
          ? 'Account created and verified.'
          : 'Account created! Please verify your email address using the verification link.',
      },
      { status: 201 }
    );

    return attachSessionCookie(res, result.sessionToken);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Unable to register user account.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
