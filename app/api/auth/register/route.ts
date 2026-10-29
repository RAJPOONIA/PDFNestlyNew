import { NextRequest, NextResponse } from 'next/server';
import { registerEmailUser, checkRateLimit } from '@/lib/platform-store';
import { attachSessionCookie, getClientIp } from '@/lib/server-auth';
import {
  isEmailVerificationConfigured,
  sendEmailVerificationMessage,
  classifySmtpError,
} from '@/lib/password-reset-mailer';

const SECURITY_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  Pragma: 'no-cache',
  'Referrer-Policy': 'no-referrer',
};

function resolveAppOrigin(req: NextRequest): string {
  const configuredAppUrl = (process.env.APP_URL || '').trim();
  if (
    configuredAppUrl &&
    configuredAppUrl !== 'MY_APP_URL' &&
    /^https?:\/\//i.test(configuredAppUrl)
  ) {
    return configuredAppUrl.replace(/\/+$/, '');
  }
  return req.nextUrl?.origin || 'https://pdfnestly.com';
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rate = checkRateLimit(`register:${ip}`, 15);
    if (!rate.allowed) {
      return NextResponse.json(
        {
          error:
            'Too many registration attempts. Please wait a minute and try again.',
        },
        {
          status: 429,
          headers: {
            ...SECURITY_HEADERS,
            'Retry-After': String(rate.retryAfterSeconds),
          },
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

    const emailDeliveryConfigured = isEmailVerificationConfigured();
    let verificationEmailSent = false;

    if (!result.user.emailVerified && emailDeliveryConfigured) {
      const origin = resolveAppOrigin(req);
      const verificationUrl = `${origin}/verify-email?uid=${encodeURIComponent(
        result.user.uid
      )}&token=${encodeURIComponent(result.verificationToken)}`;

      try {
        const sendRes = await sendEmailVerificationMessage({
          to: result.user.email,
          displayName: result.user.displayName,
          verificationUrl,
          expiresInHours: 24,
        });
        verificationEmailSent = sendRes.sent;
      } catch (err) {
        verificationEmailSent = false;
        const classified = classifySmtpError(err);
        console.error(
          `[EmailVerificationMailer] Verification email delivery failed on signup (category=${classified.category})`
        );
      }
    }

    const res = NextResponse.json(
      {
        user: result.user,
        sessionToken: result.sessionToken,
        emailSent: verificationEmailSent,
        emailDeliveryConfigured,
        message: result.user.emailVerified
          ? 'Account created and verified.'
          : verificationEmailSent
          ? 'Account created! We sent a verification link to your email address. Please check your inbox and verify within 24 hours.'
          : emailDeliveryConfigured
          ? 'Account created, but we could not send the verification email right now. You can request a new verification email from your dashboard.'
          : 'Account created! Outbound email verification is pending server SMTP configuration—once configured, you can request a verification link from your dashboard.',
      },
      { status: 201, headers: SECURITY_HEADERS }
    );

    return attachSessionCookie(res, result.sessionToken);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Unable to register user account.';
    return NextResponse.json(
      { error: message },
      { status: 400, headers: SECURITY_HEADERS }
    );
  }
}
