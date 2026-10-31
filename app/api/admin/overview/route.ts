import { NextRequest, NextResponse } from 'next/server';
import {
  getAdminOverviewMetrics,
  getAdminAnalyticsDetailed,
  getSystemSettings,
  AnalyticsTimeRange,
} from '@/lib/platform-store';
import { requireAdminUser } from '@/lib/server-auth';

export async function GET(req: NextRequest) {
  const adminCheck = await requireAdminUser(req);
  if (!adminCheck.ok) return adminCheck.response;

  try {
    const url = new URL(req.url);
    const rangeParam = url.searchParams.get('range') || undefined;
    const rangeDaysParam = url.searchParams.get('rangeDays');
    const startDateParam = url.searchParams.get('startDate') || undefined;
    const endDateParam = url.searchParams.get('endDate') || undefined;

    // Map rangeDays to range if range not explicitly specified
    let range: AnalyticsTimeRange = '28d';
    if (rangeParam && ['today', '7d', '28d', '90d', 'lifetime', 'custom'].includes(rangeParam)) {
      range = rangeParam as AnalyticsTimeRange;
    } else if (rangeDaysParam) {
      const days = Number(rangeDaysParam);
      if (days === 1) range = 'today';
      else if (days === 7) range = '7d';
      else if (days === 28 || days === 30) range = '28d';
      else if (days === 90) range = '90d';
      else if (days >= 365) range = 'lifetime';
    }

    const detailed = getAdminAnalyticsDetailed({
      range,
      startDate: startDateParam,
      endDate: endDateParam,
    });

    const overview = getAdminOverviewMetrics(
      range === 'today'
        ? 1
        : range === '7d'
        ? 7
        : range === '28d'
        ? 28
        : range === '90d'
        ? 90
        : 365
    );

    const settings = getSystemSettings();

    return NextResponse.json({
      admin: adminCheck.admin,
      range,
      analytics: detailed,
      overview,
      settings,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Unable to fetch admin overview & analytics data.',
      },
      { status: 500 }
    );
  }
}
