import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/server-auth';
import {
  getEnterpriseAnalyticsBundle,
  setErrorIncidentStatus,
} from '@/lib/admin-analytics-engine';

export async function GET(req: NextRequest) {
  const adminCheck = await requireAdminUser(req);
  if (!adminCheck.ok) return adminCheck.response;

  try {
    const url = new URL(req.url);
    const rangeParam = url.searchParams.get('range') || undefined;
    const rangeDaysParam = url.searchParams.get('rangeDays');
    const startDate = url.searchParams.get('startDate') || undefined;
    const endDate = url.searchParams.get('endDate') || undefined;
    const countryFilter = url.searchParams.get('country') || undefined;
    const toolFilter = url.searchParams.get('tool') || undefined;
    const statusFilter = url.searchParams.get('status') || undefined;

    let range = rangeParam || '28d';
    if (!rangeParam && rangeDaysParam) {
      const days = Number(rangeDaysParam);
      if (days === 1) range = 'today';
      else if (days === 7) range = '7d';
      else if (days === 28) range = '28d';
      else if (days === 30) range = '30d';
      else if (days === 90) range = '90d';
      else if (days >= 365) range = 'lifetime';
    }

    const bundle = await getEnterpriseAnalyticsBundle({
      range,
      startDate,
      endDate,
      countryFilter,
      toolFilter,
      statusFilter,
    });

    return NextResponse.json({
      admin: adminCheck.admin,
      ...bundle,
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

export async function POST(req: NextRequest) {
  const adminCheck = await requireAdminUser(req);
  if (!adminCheck.ok) return adminCheck.response;

  try {
    const body = await req.json();
    const { action, signature, status } = body || {};

    if (action === 'update_error_status' && signature && status) {
      if (['Open', 'Investigating', 'Resolved'].includes(status)) {
        setErrorIncidentStatus(String(signature), status);
        return NextResponse.json({
          ok: true,
          signature,
          status,
          message: `Incident ${signature} updated to ${status}.`,
        });
      }
    }

    return NextResponse.json({ error: 'Invalid action or parameters.' }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Operation failed.' },
      { status: 500 }
    );
  }
}
