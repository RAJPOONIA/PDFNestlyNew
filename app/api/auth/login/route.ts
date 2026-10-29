import { NextRequest, NextResponse } from 'next/server';
import { authenticateEmailUser, checkRateLimit } from '@/lib/platform-store';
import { attachSessionCookie, getClientIp } from '@/lib/server-auth';

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rate = checkRateLimit(`login:${ip}`, 25);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Too many login requests from this IP. Please wait before retrying.' },
        {
          status: 429,
          headers: { 'Retry-After': String(rate.retryAfterSeconds) },
        }
      );
    }

    const body = await req.json();
    const email = String(body.email || '');
    const password = String(body.password || '');

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required.' },
        { status: 400 }
      );
    }

    const result = authenticateEmailUser({
      email,
      password,
      userAgent: req.headers.get('user-agent') || 'Browser',
      ip,
    });

    const res = NextResponse.json({
      user: result.user,
      sessionToken: result.sessionToken,
    });

    return attachSessionCookie(res, result.sessionToken);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Authentication failed.';
    const status = message.toLowerCase().includes('locked')
      ? 429
      : message.toLowerCase().includes('suspended')
      ? 403
      : 401;
    return NextResponse.json({ error: message }, { status });
  }
}
