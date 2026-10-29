import { NextRequest, NextResponse } from 'next/server';
import {
  getUserDashboardData,
  updateUserProfile,
  deleteOwnUserAccount,
} from '@/lib/platform-store';
import {
  requireAuthenticatedUser,
  clearSessionCookie,
} from '@/lib/server-auth';

export async function GET(req: NextRequest) {
  const authCheck = await requireAuthenticatedUser(req);
  if (!authCheck.ok) return authCheck.response;

  try {
    const data = getUserDashboardData(authCheck.user.uid);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Unable to load dashboard data.',
      },
      { status: 400 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const authCheck = await requireAuthenticatedUser(req);
  if (!authCheck.ok) return authCheck.response;

  try {
    const body = await req.json();
    const updatedUser = updateUserProfile(authCheck.user.uid, {
      displayName: body.displayName,
      photoURL: body.photoURL,
      currentPassword: body.currentPassword,
      newPassword: body.newPassword,
    });

    return NextResponse.json({
      user: updatedUser,
      message: 'Account profile updated successfully.',
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Unable to update user profile.',
      },
      { status: 400 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const authCheck = await requireAuthenticatedUser(req);
  if (!authCheck.ok) return authCheck.response;

  try {
    const body = await req.json().catch(() => ({}));
    if (body.confirmText !== 'DELETE') {
      return NextResponse.json(
        { error: 'Please type DELETE to confirm permanent account deletion.' },
        { status: 400 }
      );
    }

    deleteOwnUserAccount(authCheck.user.uid);
    const res = NextResponse.json({
      success: true,
      message: 'Your account and associated records have been permanently deleted.',
    });
    return clearSessionCookie(res);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Unable to delete account.',
      },
      { status: 400 }
    );
  }
}
