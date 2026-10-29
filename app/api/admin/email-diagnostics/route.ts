import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/server-auth';
import {
  checkRateLimit,
  recordAdminEmailDiagnosticAuditLog,
} from '@/lib/platform-store';
import {
  getPrivateEmailConfigStatus,
  verifySmtpConnection,
  sendAdminDiagnosticTestEmail,
} from '@/lib/password-reset-mailer';

const SECURITY_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  Pragma: 'no-cache',
  'Referrer-Policy': 'no-referrer',
};

export async function GET(req: NextRequest) {
  const adminCheck = await requireAdminUser(req);
  if (!adminCheck.ok) return adminCheck.response;

  const configStatus = getPrivateEmailConfigStatus();
  const shouldVerify =
    req.nextUrl.searchParams.get('verifyConnection') === 'true';

  let connectionCheck: {
    verified: boolean;
    provider: string | null;
    errorCategory: string;
    sanitizedMessage: string;
  } | null = null;

  if (shouldVerify) {
    const rate = checkRateLimit(
      `admin_smtp_verify:${adminCheck.admin.uid}`,
      6
    );
    if (!rate.allowed) {
      return NextResponse.json(
        {
          error:
            'Too many SMTP connection verification checks. Please wait a minute.',
        },
        {
          status: 429,
          headers: {
            ...SECURITY_HEADERS,
            'Retry-After': String(rate.retryAfterSeconds),
          },
        }
      );
    }
    connectionCheck = await verifySmtpConnection();
  }

  return NextResponse.json(
    {
      configStatus,
      connectionCheck,
      adminRecipientEmail: adminCheck.admin.email,
    },
    { headers: SECURITY_HEADERS }
  );
}

export async function POST(req: NextRequest) {
  const adminCheck = await requireAdminUser(req);
  if (!adminCheck.ok) return adminCheck.response;

  const rate = checkRateLimit(`admin_smtp_test:${adminCheck.admin.uid}`, 3);
  if (!rate.allowed) {
    return NextResponse.json(
      {
        error:
          'Too many test email requests. Please wait a minute before sending another diagnostic email.',
      },
      {
        status: 429,
        headers: {
          ...SECURITY_HEADERS,
          'Retry-After': String(rate.retryAfterSeconds),
        },
      }
    );
  }

  const body = await req.json().catch(() => ({}));
  const requestedRecipient =
    typeof body.recipient === 'string'
      ? body.recipient.trim().toLowerCase()
      : typeof body.to === 'string'
      ? body.to.trim().toLowerCase()
      : '';

  const adminEmail = adminCheck.admin.email.trim().toLowerCase();
  if (requestedRecipient && requestedRecipient !== adminEmail) {
    return NextResponse.json(
      {
        error:
          'Diagnostic test emails are strictly restricted to the authenticated administrator email address.',
      },
      { status: 400, headers: SECURITY_HEADERS }
    );
  }

  const configStatus = getPrivateEmailConfigStatus();
  const result = await sendAdminDiagnosticTestEmail(adminEmail);

  recordAdminEmailDiagnosticAuditLog({
    adminUid: adminCheck.admin.uid,
    adminEmail,
    provider: result.provider,
    connectionVerified: result.connectionVerified,
    messageSubmitted: result.messageSubmitted,
    errorCategory: result.errorCategory,
  });

  return NextResponse.json(
    {
      configStatus,
      recipient: adminEmail,
      connectionVerified: result.connectionVerified,
      messageSubmitted: result.messageSubmitted,
      messageId: result.messageId,
      acceptedCount: result.acceptedCount,
      rejectedCount: result.rejectedCount,
      provider: result.provider,
      errorCategory: result.errorCategory,
      sanitizedMessage: result.sanitizedMessage,
      deliveryDistinctionNote:
        'messageSubmitted=true indicates the Private Email SMTP server (mail.privateemail.com) accepted the message for delivery. Confirm actual inbox receipt by checking the administrator mailbox and spam folder.',
    },
    {
      status: result.messageSubmitted ? 200 : 422,
      headers: SECURITY_HEADERS,
    }
  );
}
