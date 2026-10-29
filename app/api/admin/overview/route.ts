import { NextRequest, NextResponse } from 'next/server';
import {
  getAdminOverviewMetrics,
  getSystemSettings,
} from '@/lib/platform-store';
import { requireAdminUser } from '@/lib/server-auth';

export async function GET(req: NextRequest) {
  const adminCheck = await requireAdminUser(req);
  if (!adminCheck.ok) return adminCheck.response;

  try {
    const url = new URL(req.url);
    const rangeDays = Number(url.searchParams.get('rangeDays') || '30');
    const overview = getAdminOverviewMetrics(
      Number.isFinite(rangeDays) ? rangeDays : 30
    );
    const settings = getSystemSettings();

    return NextResponse.json({
      admin: adminCheck.admin,
      overview,
      settings,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Unable to fetch admin overview metrics.',
      },
      { status: 500 }
    );
  }
}
