import { NextRequest, NextResponse } from 'next/server';
import {
  verifyEmailWithToken,
  generateEmailVerificationTokenForUser,
  checkRateLimit,
} from '@/lib/platform-store';
import { requireAuthenticatedUser, getClientIp } from '@/lib/server-auth';
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
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || 'verify');

    if (action === 'resend') {
      const ipRate = checkRateLimit(`verify_resend_ip:${ip}`, 10);
      if (!ipRate.allowed) {
        return NextResponse.json(
          {
            error:
              'Too many verification email requests. Please wait a minute and try again.',
          },
          {
            status: 429,
            headers: {
              ...SECURITY_HEADERS,
              'Retry-After': String(ipRate.retryAfterSeconds),
            },
          }
        );
      }

      const authCheck = await requireAuthenticatedUser(req);
      if (!authCheck.ok) return authCheck.response;

      const userRate = checkRateLimit(
        `verify_resend_uid:${authCheck.user.uid}`,
        3
      );
      if (!userRate.allowed) {
        return NextResponse.json(
          {
            error:
              'Too many verification email requests. Please wait a minute before requesting another link.',
          },
          {
            status: 429,
            headers: {
              ...SECURITY_HEADERS,
              'Retry-After': String(userRate.retryAfterSeconds),
            },
          }
        );
      }

      if (authCheck.user.emailVerified) {
        return NextResponse.json(
          {
            success: true,
            alreadyVerified: true,
            emailSent: false,
            emailDeliveryConfigured: isEmailVerificationConfigured(),
            message: 'Your email address is already verified.',
          },
          { headers: SECURITY_HEADERS }
        );
      }

      const emailDeliveryConfigured = isEmailVerificationConfigured();
      const rawToken = generateEmailVerificationTokenForUser(
        authCheck.user.uid
      );

      let emailSent = false;
      let deliveryFailed = false;

      if (emailDeliveryConfigured) {
        const origin = resolveAppOrigin(req);
        const verificationUrl = `${origin}/verify-email?uid=${encodeURIComponent(
          authCheck.user.uid
        )}&token=${encodeURIComponent(rawToken)}`;

        try {
          const sendRes = await sendEmailVerificationMessage({
            to: authCheck.user.email,
            displayName: authCheck.user.displayName,
            verificationUrl,
            expiresInHours: 24,
          });
          emailSent = sendRes.sent;
          if (!sendRes.sent) {
            deliveryFailed = true;
          }
        } catch (err) {
          deliveryFailed = true;
          const classified = classifySmtpError(err);
          console.error(
            `[EmailVerificationMailer] Resend verification email failed (category=${classified.category})`
          );
        }
      }

      return NextResponse.json(
        {
          success: true,
          emailSent,
          emailDeliveryConfigured,
          message: emailSent
            ? `A fresh verification link has been sent to ${authCheck.user.email}. Please check your inbox and spam folder.`
            : deliveryFailed
            ? 'We could not complete outbound email delivery at this moment. Please try again shortly or contact support@pdfnestly.com.'
            : 'Outbound email delivery is not yet configured on this server. Once Private Email SMTP is configured, you can resend your verification email here.',
        },
        { headers: SECURITY_HEADERS }
      );
    }

    // Default action === 'verify'
    const ipRate = checkRateLimit(`verify_confirm_ip:${ip}`, 15);
    if (!ipRate.allowed) {
      return NextResponse.json(
        { error: 'Too many verification attempts. Please wait a minute.' },
        {
          status: 429,
          headers: {
            ...SECURITY_HEADERS,
            'Retry-After': String(ipRate.retryAfterSeconds),
          },
        }
      );
    }

    const uid = typeof body.uid === 'string' ? body.uid.trim() : '';
    const token = typeof body.token === 'string' ? body.token.trim() : '';

    if (!token) {
      return NextResponse.json(
        { error: 'Invalid or expired email verification token.' },
        { status: 400, headers: SECURITY_HEADERS }
      );
    }

    const targetKey = uid || token.slice(0, 16) || 'anon';
    const targetRate = checkRateLimit(
      `verify_confirm_target:${targetKey}`,
      10
    );
    if (!targetRate.allowed) {
      return NextResponse.json(
        { error: 'Too many verification attempts. Please wait a minute.' },
        {
          status: 429,
          headers: {
            ...SECURITY_HEADERS,
            'Retry-After': String(targetRate.retryAfterSeconds),
          },
        }
      );
    }

    const user = verifyEmailWithToken(uid, token);
    return NextResponse.json(
      {
        success: true,
        user,
        message: 'Your email address has been verified!',
      },
      { headers: SECURITY_HEADERS }
    );
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Invalid or expired email verification token.',
      },
      { status: 400, headers: SECURITY_HEADERS }
    );
  }
}
