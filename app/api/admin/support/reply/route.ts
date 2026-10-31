import { NextRequest, NextResponse } from 'next/server';
import {
  getSupportTicketById,
  addSupportTicketReply,
} from '@/lib/platform-store';
import { requireAdminUser } from '@/lib/server-auth';
import { sendSupportReplyEmail } from '@/lib/password-reset-mailer';

export async function POST(req: NextRequest) {
  const adminCheck = await requireAdminUser(req);
  if (!adminCheck.ok) return adminCheck.response;

  try {
    const body = await req.json();
    const { ticketId, message, newStatus } = body || {};

    if (!ticketId || typeof ticketId !== 'string') {
      return NextResponse.json(
        { error: 'Ticket ID is required.' },
        { status: 400 }
      );
    }

    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json(
        { error: 'Reply message cannot be empty.' },
        { status: 400 }
      );
    }

    const ticket = getSupportTicketById(ticketId);
    if (!ticket) {
      return NextResponse.json(
        { error: `Support ticket #${ticketId} was not found.` },
        { status: 404 }
      );
    }

    // 1. Send the email from support@pdfnestly.com
    const emailResult = await sendSupportReplyEmail({
      to: ticket.email,
      recipientName: ticket.name,
      ticketId: ticket.id,
      topic: ticket.topic,
      originalMessage: ticket.message,
      replyMessage: message.trim(),
      adminEmail: adminCheck.admin.email,
    });

    // 2. Add reply to database & update status (audit log is recorded automatically)
    const { ticket: updatedTicket, replyRecord } = addSupportTicketReply(ticket.id, {
      adminEmail: adminCheck.admin.email,
      message: message.trim(),
      newStatus:
        newStatus === 'resolved' || newStatus === 'in_progress' || newStatus === 'open'
          ? newStatus
          : 'in_progress',
    });

    return NextResponse.json({
      ok: true,
      ticket: updatedTicket,
      replyRecord,
      emailResult,
      message: `Reply sent successfully from support@pdfnestly.com to ${ticket.email}.`,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Failed to dispatch reply to support ticket.',
      },
      { status: 500 }
    );
  }
}
