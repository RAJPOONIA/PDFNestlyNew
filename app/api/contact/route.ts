import { NextRequest, NextResponse } from 'next/server';
import { createSupportTicket, recordActivityAndJobEvent } from '@/lib/platform-store';
import { getClientIp, resolveClientCountry } from '@/lib/server-auth';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, topic, message, timeZone } = body || {};

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json(
        { error: 'Name is required.' },
        { status: 400 }
      );
    }

    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return NextResponse.json(
        { error: 'A valid email address is required.' },
        { status: 400 }
      );
    }

    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json(
        { error: 'Message content is required.' },
        { status: 400 }
      );
    }

    const clientIp = getClientIp(req);
    const resolvedCountry = resolveClientCountry(req, {
      timeZone: typeof timeZone === 'string' ? timeZone : undefined,
    });

    const ticket = createSupportTicket({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      topic: typeof topic === 'string' && topic.trim() ? topic.trim() : 'General Inquiry',
      message: message.trim(),
      ip: clientIp,
      country: resolvedCountry.country,
      countryCode: resolvedCountry.countryCode,
    });

    // Record activity event
    recordActivityAndJobEvent({
      userId: null,
      anonymousSessionId: null,
      userEmail: ticket.email,
      eventType: 'page_viewed',
      toolSlug: null,
      toolName: 'Contact & Feedback Support',
      pagePath: '/contact',
      status: 'succeeded',
      country: resolvedCountry.country,
      countryCode: resolvedCountry.countryCode,
    });

    return NextResponse.json({
      ok: true,
      ticketId: ticket.id,
      ticket,
      message: `Support ticket #${ticket.id} created successfully. Our team will respond to ${ticket.email}.`,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Unable to submit support ticket.',
      },
      { status: 500 }
    );
  }
}
