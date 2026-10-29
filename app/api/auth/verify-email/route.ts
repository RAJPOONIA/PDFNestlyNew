import { NextRequest, NextResponse } from 'next/server';
import {
  verifyEmailWithToken,
  generateEmailVerificationTokenForUser,
} from '@/lib/platform-store';
import { requireAuthenticatedUser } from '@/lib/server-auth';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || 'verify');

    if (action === 'resend') {
      const authCheck = await requireAuthenticatedUser(req);
      if (!authCheck.ok) return authCheck.response;

      const token = generateEmailVerificationTokenForUser(authCheck.user.uid);
      const verificationUrl = `/verify-email?uid=${encodeURIComponent(
        authCheck.user.uid
      )}&token=${encodeURIComponent(token)}`;

      return NextResponse.json({
        success: true,
        verificationToken: token,
        verificationUrl,
        message: 'A new email verification link has been generated.',
      });
    }

    const uid = String(body.uid || '');
    const token = String(body.token || '');
    if (!uid || !token) {
      return NextResponse.json(
        { error: 'Missing user ID or verification token.' },
        { status: 400 }
      );
    }

    const user = verifyEmailWithToken(uid, token);
    return NextResponse.json({
      success: true,
      user,
      message: 'Your email address has been verified!',
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Email verification failed.',
      },
      { status: 400 }
    );
  }
}
