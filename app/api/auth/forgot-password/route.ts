import { NextRequest, NextResponse } from 'next/server';
import {
  createPasswordResetRequest,
  resetPasswordWithToken,
  checkRateLimit,
} from '@/lib/platform-store';
import { clearSessionCookie, getClientIp } from '@/lib/server-auth';
import {
  isPasswordResetEmailConfigured,
  sendPasswordResetEmail,
  classifySmtpError,
} from '@/lib/password-reset-mailer';
import { syncFirebaseUserPasswordAndRevokeSessions } from '@/lib/firebase-admin';

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
    const action = String(body.action || 'request');

    if (action === 'confirm') {
      const ipRate = checkRateLimit(`reset_confirm_ip:${ip}`, 10);
      if (!ipRate.allowed) {
        return NextResponse.json(
          { error: 'Too many password reset attempts. Please wait a minute.' },
          {
            status: 429,
            headers: {
              ...SECURITY_HEADERS,
              'Retry-After': String(ipRate.retryAfterSeconds),
            },
          }
        );
      }

      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const token = typeof body.token === 'string' ? body.token.trim() : '';
      const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

      const targetRateKey = email || token.slice(0, 16) || 'anon';
      const targetRate = checkRateLimit(`reset_confirm_target:${targetRateKey}`, 5);
      if (!targetRate.allowed) {
        return NextResponse.json(
          { error: 'Too many password reset attempts. Please wait a minute.' },
          {
            status: 429,
            headers: {
              ...SECURITY_HEADERS,
              'Retry-After': String(targetRate.retryAfterSeconds),
            },
          }
        );
      }

      if (!token || !newPassword) {
        return NextResponse.json(
          { error: 'Invalid or expired password reset token.' },
          { status: 400, headers: SECURITY_HEADERS }
        );
      }

      const updatedUser = resetPasswordWithToken({
        email: email || undefined,
        token,
        newPassword,
      });

      // Best-effort synchronization with Firebase Authentication so Firebase and custom store passwords never diverge
      await syncFirebaseUserPasswordAndRevokeSessions(
        updatedUser.email,
        newPassword
      );

      const res = NextResponse.json(
        {
          success: true,
          message:
            'Your password has been reset successfully. You can now sign in with your new password.',
        },
        { headers: SECURITY_HEADERS }
      );
      return clearSessionCookie(res);
    }

    // Default action === 'request'
    const ipRate = checkRateLimit(`reset_req_ip:${ip}`, 10);
    if (!ipRate.allowed) {
      return NextResponse.json(
        { error: 'Too many password reset requests. Please wait a minute.' },
        {
          status: 429,
          headers: {
            ...SECURITY_HEADERS,
            'Retry-After': String(ipRate.retryAfterSeconds),
          },
        }
      );
    }

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: 'Please enter a valid email address.' },
        { status: 400, headers: SECURITY_HEADERS }
      );
    }

    const emailRate = checkRateLimit(`reset_req_email:${email}`, 5);
    if (!emailRate.allowed) {
      return NextResponse.json(
        { error: 'Too many password reset requests. Please wait a minute.' },
        {
          status: 429,
          headers: {
            ...SECURITY_HEADERS,
            'Retry-After': String(emailRate.retryAfterSeconds),
          },
        }
      );
    }

    const emailDeliveryConfigured = isPasswordResetEmailConfigured();
    const resetReq = createPasswordResetRequest(email);

    let deliveryFailed = false;
    if (emailDeliveryConfigured && resetReq.resetToken) {
      const origin = resolveAppOrigin(req);
      const resetUrl = `${origin}/forgot-password?token=${encodeURIComponent(
        resetReq.resetToken
      )}`;
      try {
        const sendResult = await sendPasswordResetEmail({
          to: email,
          resetUrl,
          expiresInMinutes: resetReq.expiresInMinutes,
        });
        if (!sendResult.sent) {
          deliveryFailed = true;
        }
      } catch (err) {
        deliveryFailed = true;
        const classified = classifySmtpError(err);
        console.error(
          `[PasswordResetMailer] Outbound email delivery failed (category=${classified.category})`
        );
      }
    }

    const emailSent = emailDeliveryConfigured && !deliveryFailed;

    return NextResponse.json(
      {
        accepted: true,
        emailSent,
        emailDeliveryConfigured,
        message: emailSent
          ? 'If an account exists for that email address, we have sent password reset instructions to your inbox. Please check your email and follow the link within 15 minutes.'
          : deliveryFailed
          ? 'We could not complete outbound email delivery at this moment. Please try again shortly or contact support@pdfnestly.com.'
          : 'If an account exists for that email address, your reset request was recorded. Outbound email delivery is not yet configured on this server—please check your email once an administrator configures a transactional email provider.',
      },
      { headers: SECURITY_HEADERS }
    );
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Invalid or expired password reset token.',
      },
      { status: 400, headers: SECURITY_HEADERS }
    );
  }
}
