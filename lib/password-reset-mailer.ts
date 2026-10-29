export interface PasswordResetEmailPayload {
  to: string;
  resetUrl: string;
  expiresInMinutes: number;
}

export interface PasswordResetEmailResult {
  sent: boolean;
  configured: boolean;
  provider: 'resend' | 'sendgrid' | 'postmark' | 'webhook' | 'test' | null;
}

type TestEmailTransport = (
  payload: PasswordResetEmailPayload
) => Promise<void> | void;

let customTestTransport: TestEmailTransport | null = null;

/**
 * Registers an in-memory email transport for automated security tests.
 * Never used to expose tokens in API responses.
 */
export function setPasswordResetTestTransport(
  transport: TestEmailTransport | null
): void {
  customTestTransport = transport;
}

export function isPasswordResetEmailConfigured(): boolean {
  if (customTestTransport) return true;
  const resendKey = (process.env.RESEND_API_KEY || '').trim();
  const sendgridKey = (process.env.SENDGRID_API_KEY || '').trim();
  const postmarkToken = (process.env.POSTMARK_SERVER_TOKEN || '').trim();
  const webhookUrl = (process.env.EMAIL_WEBHOOK_URL || '').trim();

  return Boolean(resendKey || sendgridKey || postmarkToken || webhookUrl);
}

function getSenderAddress(): string {
  return (
    (process.env.EMAIL_FROM || process.env.SMTP_FROM || '').trim() ||
    'PDFNestly Security <no-reply@pdfnestly.com>'
  );
}

function buildResetEmailContent(payload: PasswordResetEmailPayload): {
  subject: string;
  text: string;
  html: string;
} {
  const subject = 'Reset your PDFNestly password';
  const text = [
    'We received a request to reset the password for your PDFNestly account.',
    '',
    `Use the single-use link below within ${payload.expiresInMinutes} minutes to set a new password:`,
    payload.resetUrl,
    '',
    'If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.',
  ].join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #18181B; line-height: 1.6; max-width: 560px; margin: 0 auto; padding: 24px;">
    <div style="border: 1px solid #E4E4E7; border-radius: 12px; padding: 24px; background: #FFFFFF;">
      <h2 style="margin-top: 0; color: #18181B;">Reset your PDFNestly password</h2>
      <p style="font-size: 14px; color: #52525B;">
        We received a request to reset the password for your PDFNestly account. Click the button below to choose a new password. This single-use link expires in <strong>${payload.expiresInMinutes} minutes</strong>.
      </p>
      <p style="margin: 24px 0;">
        <a href="${payload.resetUrl}" style="display: inline-block; background: #B91C1C; color: #FFFFFF; text-decoration: none; font-weight: 600; font-size: 14px; padding: 12px 20px; border-radius: 8px;">
          Reset Password
        </a>
      </p>
      <p style="font-size: 12px; color: #71717A;">
        If you did not request a password reset, you can safely ignore this message and your password will not be changed.
      </p>
    </div>
  </body>
</html>`;

  return { subject, text, html };
}

/**
 * Dispatches a password-reset email using the configured transactional email provider.
 * Never logs raw tokens or reset URLs.
 */
export async function sendPasswordResetEmail(
  payload: PasswordResetEmailPayload
): Promise<PasswordResetEmailResult> {
  if (customTestTransport) {
    await customTestTransport(payload);
    return { sent: true, configured: true, provider: 'test' };
  }

  const from = getSenderAddress();
  const { subject, text, html } = buildResetEmailContent(payload);

  const resendKey = (process.env.RESEND_API_KEY || '').trim();
  if (resendKey) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [payload.to],
        subject,
        text,
        html,
      }),
    });
    if (!res.ok) {
      throw new Error('Failed to dispatch password reset email via Resend.');
    }
    return { sent: true, configured: true, provider: 'resend' };
  }

  const sendgridKey = (process.env.SENDGRID_API_KEY || '').trim();
  if (sendgridKey) {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sendgridKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: payload.to }] }],
        from: { email: from.includes('<') ? from.split('<')[1].replace('>', '').trim() : from },
        subject,
        content: [
          { type: 'text/plain', value: text },
          { type: 'text/html', value: html },
        ],
      }),
    });
    if (!res.ok) {
      throw new Error('Failed to dispatch password reset email via SendGrid.');
    }
    return { sent: true, configured: true, provider: 'sendgrid' };
  }

  const postmarkToken = (process.env.POSTMARK_SERVER_TOKEN || '').trim();
  if (postmarkToken) {
    const res = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        'X-Postmark-Server-Token': postmarkToken,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        From: from,
        To: payload.to,
        Subject: subject,
        TextBody: text,
        HtmlBody: html,
        MessageStream: 'outbound',
      }),
    });
    if (!res.ok) {
      throw new Error('Failed to dispatch password reset email via Postmark.');
    }
    return { sent: true, configured: true, provider: 'postmark' };
  }

  const webhookUrl = (process.env.EMAIL_WEBHOOK_URL || '').trim();
  if (webhookUrl) {
    const webhookSecret = (process.env.EMAIL_WEBHOOK_SECRET || '').trim();
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(webhookSecret ? { Authorization: `Bearer ${webhookSecret}` } : {}),
      },
      body: JSON.stringify({
        type: 'password_reset',
        to: payload.to,
        from,
        subject,
        text,
        html,
        expiresInMinutes: payload.expiresInMinutes,
      }),
    });
    if (!res.ok) {
      throw new Error('Failed to dispatch password reset email via configured webhook.');
    }
    return { sent: true, configured: true, provider: 'webhook' };
  }

  return { sent: false, configured: false, provider: null };
}
