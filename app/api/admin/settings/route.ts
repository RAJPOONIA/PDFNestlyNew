import { NextRequest, NextResponse } from 'next/server';
import {
  getSystemSettings,
  updateSystemSettings,
  pruneExpiredActivityLogs,
} from '@/lib/platform-store';
import { requireAdminUser } from '@/lib/server-auth';

export async function GET(req: NextRequest) {
  const adminCheck = await requireAdminUser(req);
  if (!adminCheck.ok) return adminCheck.response;

  return NextResponse.json({
    settings: getSystemSettings(),
  });
}

export async function PATCH(req: NextRequest) {
  const adminCheck = await requireAdminUser(req);
  if (!adminCheck.ok) return adminCheck.response;

  try {
    const body = await req.json();

    if (body.action === 'prune_logs') {
      const pruned = pruneExpiredActivityLogs({
        adminUid: adminCheck.admin.uid,
        adminEmail: adminCheck.admin.email,
      });
      return NextResponse.json({
        prunedEvents: pruned.prunedEvents,
        prunedJobs: pruned.prunedJobs,
        auditLog: pruned.auditLog,
        message: `Pruned ${pruned.prunedEvents} expired activity event(s) and ${pruned.prunedJobs} expired PDF job(s).`,
      });
    }

    const res = updateSystemSettings({
      adminUid: adminCheck.admin.uid,
      adminEmail: adminCheck.admin.email,
      patch: {
        registrationEnabled: body.registrationEnabled,
        googleAuthEnabled: body.googleAuthEnabled,
        emailAuthEnabled: body.emailAuthEnabled,
        maintenanceMode: body.maintenanceMode,
        maintenanceMessage: body.maintenanceMessage,
        rateLimitPerMinute: body.rateLimitPerMinute,
        maxLoginAttempts: body.maxLoginAttempts,
        lockoutDurationMinutes: body.lockoutDurationMinutes,
        maxUploadSizeMb: body.maxUploadSizeMb,
        activityRetentionDays: body.activityRetentionDays,
      },
    });

    return NextResponse.json({
      settings: res.settings,
      auditLog: res.auditLog,
      message: 'Global platform settings saved and logged.',
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Unable to update platform settings.',
      },
      { status: 400 }
    );
  }
}
