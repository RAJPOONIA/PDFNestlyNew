import { NextRequest, NextResponse } from 'next/server';
import { listSupportTickets } from '@/lib/platform-store';
import { requireAdminUser } from '@/lib/server-auth';

export async function GET(req: NextRequest) {
  const adminCheck = await requireAdminUser(req);
  if (!adminCheck.ok) return adminCheck.response;

  try {
    const url = new URL(req.url);
    const statusParam = url.searchParams.get('status') || 'all';
    const searchParam = url.searchParams.get('search') || undefined;

    const tickets = listSupportTickets({
      status:
        statusParam === 'open' ||
        statusParam === 'in_progress' ||
        statusParam === 'resolved'
          ? statusParam
          : 'all',
      search: searchParam,
    });

    // Compute stats across all tickets
    const allTickets = listSupportTickets({ status: 'all' });
    const stats = {
      total: allTickets.length,
      open: allTickets.filter((t) => t.status === 'open').length,
      inProgress: allTickets.filter((t) => t.status === 'in_progress').length,
      resolved: allTickets.filter((t) => t.status === 'resolved').length,
    };

    return NextResponse.json({
      admin: adminCheck.admin,
      tickets,
      stats,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Failed to retrieve support tickets.',
      },
      { status: 500 }
    );
  }
}
