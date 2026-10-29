import { NextRequest, NextResponse } from 'next/server';
import {
  createPasswordResetRequest,
  resetPasswordWithToken,
  checkRateLimit,
} from '@/lib/platform-store';
import { getClientIp } from '@/lib/server-auth';

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rate = checkRateLimit(`pw_reset:${ip}`, 10);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Too many password reset requests. Please wait a minute.' },
        { status: 429 }
      );
    }

    const body = await req.json();
    const action = String(body.action || 'request');

    if (action === 'confirm') {
      const email = String(body.email || '');
      const token = String(body.token || '');
      const newPassword = String(body.newPassword || '');

      if (!email || !token || !newPassword) {
        return NextResponse.json(
          { error: 'Email, reset token, and new password are required.' },
          { status: 400 }
        );
      }

      const user = resetPasswordWithToken({ email, token, newPassword });
      return NextResponse.json({
        success: true,
        user,
        message: 'Password updated! You can now sign in with your new password.',
      });
    }

    const email = String(body.email || '');
    if (!email) {
      return NextResponse.json(
        { error: 'Please enter your email address.' },
        { status: 400 }
      );
    }

    const resetReq = createPasswordResetRequest(email);
    const resetUrl = resetReq.resetToken
      ? `/forgot-password?email=${encodeURIComponent(
          email.trim().toLowerCase()
        )}&token=${encodeURIComponent(resetReq.resetToken)}`
      : null;

    return NextResponse.json({
      accepted: true,
      resetUrl,
      message:
        'If an account exists for that email address, a password reset link has been prepared.',
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Password reset operation failed.',
      },
      { status: 400 }
    );
  }
}
