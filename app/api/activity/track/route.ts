import { NextRequest, NextResponse } from 'next/server';
import {
  ActivityEventType,
  recordActivityAndJobEvent,
  checkRateLimit,
} from '@/lib/platform-store';
import {
  resolveAuthenticatedUser,
  getClientIp,
} from '@/lib/server-auth';

const ALLOWED_EVENTS = new Set<ActivityEventType>([
  'signup_completed',
  'login_completed',
  'logout_completed',
  'page_viewed',
  'tool_opened',
  'pdf_upload_started',
  'pdf_processing_started',
  'pdf_processing_completed',
  'pdf_processing_failed',
  'pdf_download_completed',
]);

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rate = checkRateLimit(`track:${ip}`, 240);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Activity rate limit exceeded.' },
        { status: 429 }
      );
    }

    const body = await req.json();
    const eventType = String(body.eventType || '') as ActivityEventType;
    if (!ALLOWED_EVENTS.has(eventType)) {
      return NextResponse.json(
        { error: `Invalid event type: "${eventType}".` },
        { status: 400 }
      );
    }

    const resolved = await resolveAuthenticatedUser(req);

    const { event, job } = recordActivityAndJobEvent({
      userId: resolved?.user?.uid || null,
      userEmail: resolved?.user?.email || null,
      anonymousSessionId: body.anonymousSessionId
        ? String(body.anonymousSessionId)
        : null,
      eventType,
      toolSlug: body.toolSlug ? String(body.toolSlug) : null,
      toolName: body.toolName ? String(body.toolName) : null,
      pagePath: body.pagePath ? String(body.pagePath) : null,
      status: body.status || 'info',
      durationMs:
        typeof body.durationMs === 'number' ? body.durationMs : null,
      fileSizeBytes:
        typeof body.fileSizeBytes === 'number' ? body.fileSizeBytes : null,
      outputSizeBytes:
        typeof body.outputSizeBytes === 'number' ? body.outputSizeBytes : null,
      errorCategory: body.errorCategory ? String(body.errorCategory) : null,
      jobId: body.jobId ? String(body.jobId) : null,
      dedupeKey: body.dedupeKey ? String(body.dedupeKey) : null,
    });

    return NextResponse.json({
      recorded: true,
      eventId: event.id,
      jobId: job?.id || event.jobId || null,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : 'Failed to record activity event.',
      },
      { status: 400 }
    );
  }
}
