import { NextRequest, NextResponse } from 'next/server';
import { updateSupportTicketStatus } from '@/lib/platform-store';
import { requireAdminUser } from '@/lib/server-auth';

export async function POST(req: NextRequest) {
  const adminCheck = await requireAdminUser(req);
  if (!adminCheck.ok) return adminCheck.response;

  try {
    const body = await req.json();
    const { ticketId, status } = body || {};

    if (!ticketId || typeof ticketId !== 'string') {
      return NextResponse.json(
        { error: 'Ticket ID is required.' },
        { status: 400 }
      );
    }

    if (status !== 'open' && status !== 'in_progress' && status !== 'resolved') {
      return NextResponse.json(
        { error: 'Status must be open, in_progress, or resolved.' },
        { status: 400 }
      );
    }

    // updateSupportTicketStatus automatically records the audit log in platform-store
    const updated = updateSupportTicketStatus(ticketId, status, adminCheck.admin.email);
    if (!updated) {
      return NextResponse.json(
        { error: `Ticket #${ticketId} was not found.` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      ticket: updated,
      message: `Ticket #${ticketId} status updated to ${status}.`,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Failed to update ticket status.',
      },
      { status: 500 }
    );
  }
}
