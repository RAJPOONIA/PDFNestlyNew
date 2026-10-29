import { NextRequest, NextResponse } from 'next/server';
import {
  listAdminActivityEvents,
  listAdminPdfJobs,
  listAdminAuditLogs,
} from '@/lib/platform-store';
import { requireAdminUser } from '@/lib/server-auth';

export async function GET(req: NextRequest) {
  const adminCheck = await requireAdminUser(req);
  if (!adminCheck.ok) return adminCheck.response;

  try {
    const url = new URL(req.url);
    const eventType = url.searchParams.get('eventType') || 'all';
    const toolSlug = url.searchParams.get('toolSlug') || 'all';
    const status = url.searchParams.get('status') || 'all';
    const search = url.searchParams.get('search') || '';
    const limit = Number(url.searchParams.get('limit') || '100');

    const events = listAdminActivityEvents({
      eventType,
      toolSlug,
      status,
      search,
      limit,
    });

    const jobs = listAdminPdfJobs({
      toolSlug,
      status,
      search,
      limit,
    });

    const auditLogs = listAdminAuditLogs(limit);

    return NextResponse.json({
      events,
      jobs,
      auditLogs,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Unable to load activity events and PDF jobs.',
      },
      { status: 500 }
    );
  }
}
