import { NextRequest, NextResponse } from 'next/server';
import {
  listAdminUsers,
  getAdminUserDetail,
  adminUpdateUserStatus,
  adminUpdateUserRole,
  adminRevokeUserSessions,
  adminDeleteUser,
  AccountStatus,
  UserRole,
} from '@/lib/platform-store';
import { requireAdminUser } from '@/lib/server-auth';

export async function GET(req: NextRequest) {
  const adminCheck = await requireAdminUser(req);
  if (!adminCheck.ok) return adminCheck.response;

  try {
    const url = new URL(req.url);
    const detailUid = url.searchParams.get('uid');
    if (detailUid) {
      const detail = getAdminUserDetail(detailUid);
      return NextResponse.json(detail);
    }

    const search = url.searchParams.get('search') || '';
    const provider = url.searchParams.get('provider') || 'all';
    const status = url.searchParams.get('status') || 'all';
    const role = url.searchParams.get('role') || 'all';
    const sortBy = (url.searchParams.get('sortBy') || 'createdAt') as
      | 'createdAt'
      | 'lastLoginAt'
      | 'lastActiveAt'
      | 'pdfJobsCount';
    const sortDir = (url.searchParams.get('sortDir') || 'desc') as 'asc' | 'desc';
    const page = Number(url.searchParams.get('page') || '1');
    const pageSize = Number(url.searchParams.get('pageSize') || '20');

    const result = listAdminUsers({
      search,
      provider,
      status,
      role,
      sortBy,
      sortDir,
      page,
      pageSize,
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : 'Unable to fetch users list.',
      },
      { status: 400 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const adminCheck = await requireAdminUser(req);
  if (!adminCheck.ok) return adminCheck.response;

  try {
    const body = await req.json();
    const action = String(body.action || '');
    const targetUid = String(body.targetUid || '');

    if (!targetUid) {
      return NextResponse.json(
        { error: 'Target user UID is required.' },
        { status: 400 }
      );
    }

    if (action === 'suspend' || action === 'reactivate') {
      const newStatus: AccountStatus =
        action === 'suspend' ? 'suspended' : 'active';
      const res = adminUpdateUserStatus({
        adminUid: adminCheck.admin.uid,
        adminEmail: adminCheck.admin.email,
        targetUid,
        newStatus,
        reason: body.reason ? String(body.reason) : undefined,
      });
      return NextResponse.json({
        user: res.user,
        auditLog: res.auditLog,
        message:
          newStatus === 'suspended'
            ? `User ${res.user.email} has been suspended and active sessions revoked.`
            : `User ${res.user.email} has been reactivated.`,
      });
    }

    if (action === 'change_role') {
      const newRole = (body.newRole === 'admin' ? 'admin' : 'user') as UserRole;
      const res = adminUpdateUserRole({
        adminUid: adminCheck.admin.uid,
        adminEmail: adminCheck.admin.email,
        targetUid,
        newRole,
      });
      return NextResponse.json({
        user: res.user,
        auditLog: res.auditLog,
        message: `Updated role for ${res.user.email} to "${newRole}".`,
      });
    }

    if (action === 'revoke_sessions') {
      const res = adminRevokeUserSessions({
        adminUid: adminCheck.admin.uid,
        adminEmail: adminCheck.admin.email,
        targetUid,
      });
      return NextResponse.json({
        revokedCount: res.revokedCount,
        auditLog: res.auditLog,
        message: `Revoked ${res.revokedCount} active session(s).`,
      });
    }

    return NextResponse.json(
      { error: `Unsupported user management action: "${action}".` },
      { status: 400 }
    );
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Failed to execute user management action.',
      },
      { status: 400 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const adminCheck = await requireAdminUser(req);
  if (!adminCheck.ok) return adminCheck.response;

  try {
    const body = await req.json();
    const targetUid = String(body.targetUid || '');
    if (!targetUid) {
      return NextResponse.json(
        { error: 'Target user UID is required.' },
        { status: 400 }
      );
    }

    const res = adminDeleteUser({
      adminUid: adminCheck.admin.uid,
      adminEmail: adminCheck.admin.email,
      targetUid,
    });

    return NextResponse.json({
      deletedEmail: res.deletedEmail,
      auditLog: res.auditLog,
      message: `Deleted account ${res.deletedEmail} permanently.`,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : 'Unable to delete user account.',
      },
      { status: 400 }
    );
  }
}
