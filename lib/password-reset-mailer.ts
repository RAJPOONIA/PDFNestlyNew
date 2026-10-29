import nodemailer from 'nodemailer';

export type EmailProviderType =
  | 'private_email'
  | 'resend'
  | 'sendgrid'
  | 'postmark'
  | 'webhook'
  | 'test';

export type SmtpErrorCategory =
  | 'none'
  | 'missing_config'
  | 'auth_failed'
  | 'sender_alias_rejected'
  | 'recipient_rejected'
  | 'tls_error'
  | 'dns_or_network_error'
  | 'rate_limited'
  | 'smtp_error';

export interface PasswordResetEmailPayload {
  to: string;
  resetUrl: string;
  expiresInMinutes: number;
}

export interface EmailVerificationPayload {
  to: string;
  displayName?: string;
  verificationUrl: string;
  expiresInHours: number;
}

export interface TransactionalEmailResult {
  sent: boolean;
  configured: boolean;
  provider: EmailProviderType | null;
  messageId?: string | null;
  errorCategory?: SmtpErrorCategory;
  sanitizedError?: string;
}

export type PasswordResetEmailResult = TransactionalEmailResult;

export interface MockSmtpSendMailOptions {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
}

export interface MockSmtpSendMailResult {
  messageId?: string;
  accepted?: string[];
  rejected?: string[];
  response?: string;
}

export interface MockSmtpTransportAdapter {
  verify: () => Promise<boolean>;
  sendMail: (
    mailOptions: MockSmtpSendMailOptions
  ) => Promise<MockSmtpSendMailResult>;
}

type TestResetEmailTransport = (
  payload: PasswordResetEmailPayload
) => Promise<void> | void;

type TestVerificationEmailTransport = (
  payload: EmailVerificationPayload
) => Promise<void> | void;

let customResetTestTransport: TestResetEmailTransport | null = null;
let customVerificationTestTransport: TestVerificationEmailTransport | null =
  null;
let customMockSmtpTransport: MockSmtpTransportAdapter | null = null;

/**
 * Registers an in-memory password-reset email transport for automated security tests.
 * Never used to expose tokens in API responses.
 */
export function setPasswordResetTestTransport(
  transport: TestResetEmailTransport | null
): void {
  customResetTestTransport = transport;
}

/**
 * Registers an in-memory email-verification transport for automated security tests.
 * Never used to expose tokens in API responses.
 */
export function setEmailVerificationTestTransport(
  transport: TestVerificationEmailTransport | null
): void {
  customVerificationTestTransport = transport;
}

/**
 * Registers a mock SMTP transport adapter for testing Nodemailer Private Email SMTP flows
 * without making live network connections during automated tests.
 */
export function setMockSmtpTransport(
  transport: MockSmtpTransportAdapter | null
): void {
  customMockSmtpTransport = transport;
}

export interface PrivateEmailSmtpConfigStatus {
  hostPresent: boolean;
  portPresent: boolean;
  userPresent: boolean;
  passwordPresent: boolean;
  fromPresent: boolean;
  ipOverridePresent: boolean;
  allRequiredPresent: boolean;
  configuredHost: string | null;
  configuredIpOverride: string | null;
  configuredPort: number | null;
  configuredFromAddress: string | null;
  activeProvider: EmailProviderType | null;
}

function getPrivateEmailEnv() {
  const host = (process.env.PRIVATE_EMAIL_SMTP_HOST || '').trim();
  const ip = (process.env.PRIVATE_EMAIL_SMTP_IP || '').trim();
  const portRaw = (process.env.PRIVATE_EMAIL_SMTP_PORT || '').trim();
  const user = (process.env.PRIVATE_EMAIL_SMTP_USER || '').trim();
  const password = process.env.PRIVATE_EMAIL_SMTP_PASSWORD || '';
  const from = (process.env.PRIVATE_EMAIL_FROM || '').trim();

  const portNum = portRaw ? Number(portRaw) : NaN;
  const validPort =
    Number.isInteger(portNum) && portNum > 0 && portNum <= 65535
      ? portNum
      : null;

  return {
    host,
    ip,
    portRaw,
    port: validPort,
    user,
    password,
    from,
    hostPresent: host.length > 0,
    ipPresent: ip.length > 0,
    portPresent: validPort !== null,
    userPresent: user.length > 0,
    passwordPresent: password.trim().length > 0,
    fromPresent: from.length > 0,
    isConfigured:
      host.length > 0 &&
      validPort !== null &&
      user.length > 0 &&
      password.trim().length > 0 &&
      from.length > 0,
  };
}

/**
 * Resolves the single active email provider without fallback duplication.
 * Priority:
 * 1. Explicit EMAIL_PROVIDER env var if set ('private_email' | 'resend' | 'sendgrid' | 'postmark' | 'webhook')
 * 2. Namecheap Private Email SMTP if all 5 required PRIVATE_EMAIL_* env vars are present
 * 3. Resend -> SendGrid -> Postmark -> Webhook
 */
export function resolveActiveEmailProvider(): EmailProviderType | null {
  const explicit = (process.env.EMAIL_PROVIDER || '').trim().toLowerCase();
  const smtp = getPrivateEmailEnv();
  const resendKey = (process.env.RESEND_API_KEY || '').trim();
  const sendgridKey = (process.env.SENDGRID_API_KEY || '').trim();
  const postmarkToken = (process.env.POSTMARK_SERVER_TOKEN || '').trim();
  const webhookUrl = (process.env.EMAIL_WEBHOOK_URL || '').trim();

  if (explicit === 'private_email' || explicit === 'smtp') {
    return smtp.isConfigured ? 'private_email' : null;
  }
  if (explicit === 'resend') {
    return resendKey ? 'resend' : null;
  }
  if (explicit === 'sendgrid') {
    return sendgridKey ? 'sendgrid' : null;
  }
  if (explicit === 'postmark') {
    return postmarkToken ? 'postmark' : null;
  }
  if (explicit === 'webhook') {
    return webhookUrl ? 'webhook' : null;
  }

  if (smtp.isConfigured) return 'private_email';
  if (resendKey) return 'resend';
  if (sendgridKey) return 'sendgrid';
  if (postmarkToken) return 'postmark';
  if (webhookUrl) return 'webhook';
  return null;
}

export function getPrivateEmailConfigStatus(): PrivateEmailSmtpConfigStatus {
  const smtp = getPrivateEmailEnv();
  const activeProvider = resolveActiveEmailProvider();
  return {
    hostPresent: smtp.hostPresent,
    portPresent: smtp.portPresent,
    userPresent: smtp.userPresent,
    passwordPresent: smtp.passwordPresent,
    fromPresent: smtp.fromPresent,
    ipOverridePresent: smtp.ipPresent,
    allRequiredPresent: smtp.isConfigured,
    configuredHost: smtp.hostPresent ? smtp.host : null,
    configuredIpOverride: smtp.ipPresent ? smtp.ip : null,
    configuredPort: smtp.port,
    configuredFromAddress: smtp.fromPresent ? smtp.from : null,
    activeProvider,
  };
}

export function isPasswordResetEmailConfigured(): boolean {
  if (customResetTestTransport || customMockSmtpTransport) return true;
  return resolveActiveEmailProvider() !== null;
}

export function isEmailVerificationConfigured(): boolean {
  if (customVerificationTestTransport || customMockSmtpTransport) return true;
  return resolveActiveEmailProvider() !== null;
}

function getFallbackSenderAddress(): string {
  const smtp = getPrivateEmailEnv();
  if (smtp.fromPresent) {
    return smtp.from;
  }
  return (
    (process.env.EMAIL_FROM || process.env.SMTP_FROM || '').trim() ||
    'PDFNestly Support <support@pdfnestly.com>'
  );
}

/**
 * Classifies an SMTP or provider error into a safe, non-secret diagnostic category
 * without ever echoing passwords, tokens, or raw credentials.
 */
export function classifySmtpError(err: unknown): {
  category: SmtpErrorCategory;
  sanitizedMessage: string;
} {
  const rawMessage =
    err instanceof Error ? err.message : String(err || 'Unknown SMTP error');
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code || '')
      : '';
  const responseCode =
    typeof err === 'object' && err !== null && 'responseCode' in err
      ? Number((err as { responseCode?: unknown }).responseCode || 0)
      : 0;
  const responseText =
    typeof err === 'object' && err !== null && 'response' in err
      ? String((err as { response?: unknown }).response || '')
      : '';

  const combined = `${code} ${responseCode} ${rawMessage} ${responseText}`.toLowerCase();

  if (
    combined.includes('missing_config') ||
    combined.includes('not configured')
  ) {
    return {
      category: 'missing_config',
      sanitizedMessage:
        'Private Email SMTP environment variables are not fully configured on the server.',
    };
  }

  // Detect sender alias rejection specifically (e.g. 550 / 553 / 554 Sender address rejected: not owned by user)
  if (
    combined.includes('sender address rejected') ||
    combined.includes('not owned by') ||
    combined.includes('from address') ||
    combined.includes('sender rejected') ||
    combined.includes('unauthorized sender') ||
    combined.includes('alias') ||
    ((responseCode === 550 || responseCode === 553 || responseCode === 554) &&
      (combined.includes('support@') || combined.includes('sender') || combined.includes('mail from')))
  ) {
    return {
      category: 'sender_alias_rejected',
      sanitizedMessage:
        'The SMTP server rejected the configured PRIVATE_EMAIL_FROM sender alias. Verify in Namecheap Private Email settings that support@pdfnestly.com is added as an active alias under the authenticated mailbox (rajpoonia@pdfnestly.com). PDFNestly will not silently switch to an unverified sender.',
    };
  }

  if (
    code === 'EAUTH' ||
    responseCode === 535 ||
    combined.includes('authentication failed') ||
    combined.includes('invalid login') ||
    combined.includes('username and password not accepted') ||
    combined.includes('auth')
  ) {
    return {
      category: 'auth_failed',
      sanitizedMessage:
        'SMTP authentication failed on mail.privateemail.com. Verify that PRIVATE_EMAIL_SMTP_USER is set to the primary mailbox (rajpoonia@pdfnestly.com) and PRIVATE_EMAIL_SMTP_PASSWORD matches the current mailbox password.',
    };
  }

  if (
    code === 'ESOCKET' &&
    (combined.includes('cert') ||
      combined.includes('tls') ||
      combined.includes('ssl') ||
      combined.includes('handshake'))
  ) {
    return {
      category: 'tls_error',
      sanitizedMessage:
        'SSL/TLS handshake or certificate validation failed when connecting to the SMTP server on port 465.',
    };
  }

  if (
    combined.includes('certificate') ||
    combined.includes('tls') ||
    combined.includes('wrong version number') ||
    combined.includes('self signed')
  ) {
    return {
      category: 'tls_error',
      sanitizedMessage:
        'SSL/TLS certificate validation failed. Ensure PRIVATE_EMAIL_SMTP_HOST is mail.privateemail.com and PRIVATE_EMAIL_SMTP_PORT is 465.',
    };
  }

  if (
    code === 'EDNS' ||
    code === 'ENOTFOUND' ||
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT' ||
    code === 'EHOSTUNREACH' ||
    combined.includes('getaddrinfo') ||
    combined.includes('connect etimedout') ||
    combined.includes('connection refused')
  ) {
    return {
      category: 'dns_or_network_error',
      sanitizedMessage:
        'Unable to reach the SMTP host over the network (DNS lookup, timeout, or outbound port 465 blocked by VPS firewall).',
    };
  }

  if (
    responseCode === 550 ||
    responseCode === 551 ||
    responseCode === 552 ||
    responseCode === 553 ||
    combined.includes('recipient address rejected')
  ) {
    return {
      category: 'recipient_rejected',
      sanitizedMessage:
        'The SMTP server rejected the recipient address or sender policy.',
    };
  }

  if (
    responseCode === 421 ||
    responseCode === 450 ||
    responseCode === 451 ||
    responseCode === 452 ||
    combined.includes('rate limit') ||
    combined.includes('too many')
  ) {
    return {
      category: 'rate_limited',
      sanitizedMessage:
        'The SMTP server temporarily rate-limited or deferred the message.',
    };
  }

  return {
    category: 'smtp_error',
    sanitizedMessage:
      'The transactional email provider encountered an error while processing the message.',
  };
}

export interface PrivateEmailConnectionParams {
  host: string;
  port: number;
  secure: boolean;
  tls: {
    rejectUnauthorized: true;
    minVersion: 'TLSv1.2';
    servername: string;
  };
  connectionTimeout: number;
  greetingTimeout: number;
  socketTimeout: number;
}

/**
 * Resolves the non-secret Nodemailer connection and TLS parameters for Private Email SMTP.
 * Uses PRIVATE_EMAIL_SMTP_IP as the TCP connection host when configured (to bypass VPS DNS timeouts),
 * while always setting TLS `servername` to PRIVATE_EMAIL_SMTP_HOST for SNI and strict certificate validation.
 * Note: Do not assume an SMTP IP override is permanent; update PRIVATE_EMAIL_SMTP_IP if the provider rotates IPs.
 */
export function resolvePrivateEmailConnectionParams(): PrivateEmailConnectionParams {
  const smtp = getPrivateEmailEnv();
  if (!smtp.isConfigured || !smtp.port) {
    throw new Error('missing_config: Private Email SMTP variables are incomplete.');
  }

  const connectionHost = smtp.ipPresent ? smtp.ip : smtp.host;

  return {
    host: connectionHost,
    port: smtp.port,
    secure: smtp.port === 465,
    tls: {
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2',
      servername: smtp.host,
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  };
}

export function createPrivateEmailTransport(): MockSmtpTransportAdapter {
  if (customMockSmtpTransport) {
    return customMockSmtpTransport;
  }

  const smtp = getPrivateEmailEnv();
  const connectionParams = resolvePrivateEmailConnectionParams();

  // Port 465 uses implicit SSL/TLS (secure: true) with strict certificate verification.
  // When PRIVATE_EMAIL_SMTP_IP is set, Nodemailer connects to that IP while TLS SNI
  // and certificate verification still validate against PRIVATE_EMAIL_SMTP_HOST.
  const transporter = nodemailer.createTransport({
    host: connectionParams.host,
    port: connectionParams.port,
    secure: connectionParams.secure,
    auth: {
      user: smtp.user,
      pass: smtp.password,
    },
    tls: connectionParams.tls,
    connectionTimeout: connectionParams.connectionTimeout,
    greetingTimeout: connectionParams.greetingTimeout,
    socketTimeout: connectionParams.socketTimeout,
  });

  return {
    verify: () => transporter.verify(),
    sendMail: async (opts) => {
      const info = await transporter.sendMail(opts);
      return {
        messageId: info.messageId,
        accepted: Array.isArray(info.accepted)
          ? info.accepted.map((a) => String(a))
          : [],
        rejected: Array.isArray(info.rejected)
          ? info.rejected.map((r) => String(r))
          : [],
        response: info.response,
      };
    },
  };
}

export async function verifySmtpConnection(): Promise<{
  verified: boolean;
  provider: EmailProviderType | null;
  errorCategory: SmtpErrorCategory;
  sanitizedMessage: string;
}> {
  const status = getPrivateEmailConfigStatus();
  if (!customMockSmtpTransport && !status.allRequiredPresent) {
    return {
      verified: false,
      provider: status.activeProvider,
      errorCategory: 'missing_config',
      sanitizedMessage:
        'Private Email SMTP is not yet configured. Set PRIVATE_EMAIL_SMTP_HOST, PRIVATE_EMAIL_SMTP_PORT, PRIVATE_EMAIL_SMTP_USER, PRIVATE_EMAIL_SMTP_PASSWORD, and PRIVATE_EMAIL_FROM on the server.',
    };
  }

  try {
    const transport = createPrivateEmailTransport();
    await transport.verify();
    return {
      verified: true,
      provider: 'private_email',
      errorCategory: 'none',
      sanitizedMessage:
        'SMTP SSL/TLS connection and mailbox authentication succeeded on mail.privateemail.com:465.',
    };
  } catch (err) {
    const classified = classifySmtpError(err);
    return {
      verified: false,
      provider: 'private_email',
      errorCategory: classified.category,
      sanitizedMessage: classified.sanitizedMessage,
    };
  }
}

function buildResetEmailContent(payload: PasswordResetEmailPayload): {
  subject: string;
  text: string;
  html: string;
} {
  const subject = 'Reset your PDFNestly password';
  const text = [
    'Hello,',
    '',
    'We received a request to reset the password for your PDFNestly account (https://pdfnestly.com).',
    '',
    `Open the single-use link below within ${payload.expiresInMinutes} minutes to set a new password:`,
    payload.resetUrl,
    '',
    'If you did not request a password reset, you can safely ignore this email and your password will remain unchanged.',
    '',
    '— PDFNestly Support',
    'https://pdfnestly.com',
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
      <p style="font-size: 12px; color: #71717A; word-break: break-all;">
        Or copy and paste this URL into your browser:<br />
        <a href="${payload.resetUrl}" style="color: #B91C1C;">${payload.resetUrl}</a>
      </p>
      <hr style="border: none; border-top: 1px solid #E4E4E7; margin: 20px 0;" />
      <p style="font-size: 12px; color: #71717A; margin-bottom: 0;">
        If you did not request a password reset, you can safely ignore this message and your password will not be changed.
      </p>
    </div>
  </body>
</html>`;

  return { subject, text, html };
}

function buildVerificationEmailContent(payload: EmailVerificationPayload): {
  subject: string;
  text: string;
  html: string;
} {
  const greeting = payload.displayName
    ? `Hello ${payload.displayName},`
    : 'Hello,';
  const subject = 'Verify your email address for PDFNestly';
  const text = [
    greeting,
    '',
    'Welcome to PDFNestly (https://pdfnestly.com)! Please verify your email address to activate all account security settings.',
    '',
    `Open the single-use verification link below within ${payload.expiresInHours} hours:`,
    payload.verificationUrl,
    '',
    'If you did not create a PDFNestly account, you can safely ignore this email.',
    '',
    '— PDFNestly Support',
    'https://pdfnestly.com',
  ].join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #18181B; line-height: 1.6; max-width: 560px; margin: 0 auto; padding: 24px;">
    <div style="border: 1px solid #E4E4E7; border-radius: 12px; padding: 24px; background: #FFFFFF;">
      <h2 style="margin-top: 0; color: #18181B;">Verify your PDFNestly email address</h2>
      <p style="font-size: 14px; color: #52525B;">
        ${greeting} Thank you for creating a PDFNestly account. Click the button below to confirm your email address. This single-use verification link expires in <strong>${payload.expiresInHours} hours</strong>.
      </p>
      <p style="margin: 24px 0;">
        <a href="${payload.verificationUrl}" style="display: inline-block; background: #16865B; color: #FFFFFF; text-decoration: none; font-weight: 600; font-size: 14px; padding: 12px 20px; border-radius: 8px;">
          Verify Email Address
        </a>
      </p>
      <p style="font-size: 12px; color: #71717A; word-break: break-all;">
        Or copy and paste this URL into your browser:<br />
        <a href="${payload.verificationUrl}" style="color: #16865B;">${payload.verificationUrl}</a>
      </p>
      <hr style="border: none; border-top: 1px solid #E4E4E7; margin: 20px 0;" />
      <p style="font-size: 12px; color: #71717A; margin-bottom: 0;">
        If you did not create a PDFNestly account, you can safely ignore this message.
      </p>
    </div>
  </body>
</html>`;

  return { subject, text, html };
}

async function dispatchTransactionalEmail(params: {
  type: 'password_reset' | 'email_verification';
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<TransactionalEmailResult> {
  if (customMockSmtpTransport) {
    const smtp = getPrivateEmailEnv();
    const fromHeader =
      smtp.from || 'PDFNestly Support <support@pdfnestly.com>';
    const info = await customMockSmtpTransport.sendMail({
      from: fromHeader,
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html,
    });
    if (info.rejected && info.rejected.length > 0 && (!info.accepted || info.accepted.length === 0)) {
      throw new Error('Recipient address rejected by SMTP server.');
    }
    return {
      sent: true,
      configured: true,
      provider: 'private_email',
      messageId: info.messageId || null,
      errorCategory: 'none',
    };
  }

  const provider = resolveActiveEmailProvider();
  if (!provider) {
    return {
      sent: false,
      configured: false,
      provider: null,
      errorCategory: 'missing_config',
    };
  }

  if (provider === 'private_email') {
    const smtp = getPrivateEmailEnv();
    const transport = createPrivateEmailTransport();
    const info = await transport.sendMail({
      from: smtp.from,
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html,
    });

    if (
      info.rejected &&
      info.rejected.length > 0 &&
      (!info.accepted || info.accepted.length === 0)
    ) {
      throw new Error('Recipient address rejected by Private Email SMTP server.');
    }

    return {
      sent: true,
      configured: true,
      provider: 'private_email',
      messageId: info.messageId || null,
      errorCategory: 'none',
    };
  }

  const from = getFallbackSenderAddress();

  if (provider === 'resend') {
    const resendKey = (process.env.RESEND_API_KEY || '').trim();
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [params.to],
        subject: params.subject,
        text: params.text,
        html: params.html,
      }),
    });
    if (!res.ok) {
      throw new Error('Failed to dispatch email via Resend.');
    }
    return { sent: true, configured: true, provider: 'resend' };
  }

  if (provider === 'sendgrid') {
    const sendgridKey = (process.env.SENDGRID_API_KEY || '').trim();
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sendgridKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: params.to }] }],
        from: {
          email: from.includes('<')
            ? from.split('<')[1].replace('>', '').trim()
            : from,
        },
        subject: params.subject,
        content: [
          { type: 'text/plain', value: params.text },
          { type: 'text/html', value: params.html },
        ],
      }),
    });
    if (!res.ok) {
      throw new Error('Failed to dispatch email via SendGrid.');
    }
    return { sent: true, configured: true, provider: 'sendgrid' };
  }

  if (provider === 'postmark') {
    const postmarkToken = (process.env.POSTMARK_SERVER_TOKEN || '').trim();
    const res = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        'X-Postmark-Server-Token': postmarkToken,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        From: from,
        To: params.to,
        Subject: params.subject,
        TextBody: params.text,
        HtmlBody: params.html,
        MessageStream: 'outbound',
      }),
    });
    if (!res.ok) {
      throw new Error('Failed to dispatch email via Postmark.');
    }
    return { sent: true, configured: true, provider: 'postmark' };
  }

  if (provider === 'webhook') {
    const webhookUrl = (process.env.EMAIL_WEBHOOK_URL || '').trim();
    const webhookSecret = (process.env.EMAIL_WEBHOOK_SECRET || '').trim();
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(webhookSecret ? { Authorization: `Bearer ${webhookSecret}` } : {}),
      },
      body: JSON.stringify({
        type: params.type,
        to: params.to,
        from,
        subject: params.subject,
        text: params.text,
        html: params.html,
      }),
    });
    if (!res.ok) {
      throw new Error('Failed to dispatch email via configured webhook.');
    }
    return { sent: true, configured: true, provider: 'webhook' };
  }

  return { sent: false, configured: false, provider: null };
}

/**
 * Dispatches a password-reset email using the configured transactional email provider.
 * Never logs raw tokens, reset URLs, or SMTP passwords.
 */
export async function sendPasswordResetEmail(
  payload: PasswordResetEmailPayload
): Promise<PasswordResetEmailResult> {
  if (customResetTestTransport) {
    await customResetTestTransport(payload);
    return { sent: true, configured: true, provider: 'test' };
  }

  const { subject, text, html } = buildResetEmailContent(payload);
  return dispatchTransactionalEmail({
    type: 'password_reset',
    to: payload.to,
    subject,
    text,
    html,
  });
}

/**
 * Dispatches an email-verification message using the configured transactional email provider.
 * Never logs raw tokens, verification URLs, or SMTP passwords.
 */
export async function sendEmailVerificationMessage(
  payload: EmailVerificationPayload
): Promise<TransactionalEmailResult> {
  if (customVerificationTestTransport) {
    await customVerificationTestTransport(payload);
    return { sent: true, configured: true, provider: 'test' };
  }

  const { subject, text, html } = buildVerificationEmailContent(payload);
  return dispatchTransactionalEmail({
    type: 'email_verification',
    to: payload.to,
    subject,
    text,
    html,
  });
}

/**
 * Sends a diagnostic test email strictly to the authenticated administrator's own email address.
 * Distinguishes SMTP server acceptance from final inbox receipt.
 */
export async function sendAdminDiagnosticTestEmail(adminEmail: string): Promise<{
  connectionVerified: boolean;
  messageSubmitted: boolean;
  messageId: string | null;
  acceptedCount: number;
  rejectedCount: number;
  provider: EmailProviderType | null;
  errorCategory: SmtpErrorCategory;
  sanitizedMessage: string;
}> {
  const status = getPrivateEmailConfigStatus();
  if (!customMockSmtpTransport && !status.allRequiredPresent) {
    return {
      connectionVerified: false,
      messageSubmitted: false,
      messageId: null,
      acceptedCount: 0,
      rejectedCount: 0,
      provider: status.activeProvider,
      errorCategory: 'missing_config',
      sanitizedMessage:
        'Private Email SMTP environment variables are not all present. Configure PRIVATE_EMAIL_SMTP_HOST, PRIVATE_EMAIL_SMTP_PORT, PRIVATE_EMAIL_SMTP_USER, PRIVATE_EMAIL_SMTP_PASSWORD, and PRIVATE_EMAIL_FROM on the server.',
    };
  }

  let connectionVerified = false;
  try {
    const transport = createPrivateEmailTransport();
    await transport.verify();
    connectionVerified = true;

    const smtp = getPrivateEmailEnv();
    const fromHeader =
      smtp.from || 'PDFNestly Support <support@pdfnestly.com>';
    const timestamp = new Date().toISOString();

    const info = await transport.sendMail({
      from: fromHeader,
      to: adminEmail,
      subject: `PDFNestly SMTP Diagnostic Test (${timestamp})`,
      text: [
        'This is an administrator-initiated SMTP diagnostic test from PDFNestly (https://pdfnestly.com).',
        '',
        `Timestamp (UTC): ${timestamp}`,
        `SMTP Host: ${smtp.host || 'mail.privateemail.com'}`,
        `SMTP Port: ${smtp.port || 465} (SSL/TLS)`,
        `From Header: ${fromHeader}`,
        `Recipient (Admin): ${adminEmail}`,
        '',
        'Receiving this message in your inbox confirms that both Private Email SMTP submission and external delivery succeeded.',
      ].join('\n'),
      html: `<!DOCTYPE html>
<html lang="en">
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #18181B; line-height: 1.6; max-width: 560px; margin: 0 auto; padding: 24px;">
    <div style="border: 1px solid #E4E4E7; border-radius: 12px; padding: 24px; background: #FFFFFF;">
      <h2 style="margin-top: 0; color: #16865B;">PDFNestly SMTP Diagnostic Test</h2>
      <p style="font-size: 14px; color: #52525B;">
        This message was triggered from the PDFNestly Admin Console to verify Namecheap Private Email SMTP configuration.
      </p>
      <ul style="font-size: 13px; color: #18181B; padding-left: 20px;">
        <li><strong>Timestamp (UTC):</strong> ${timestamp}</li>
        <li><strong>SMTP Host:</strong> ${smtp.host || 'mail.privateemail.com'}:${smtp.port || 465} (SSL/TLS)</li>
        <li><strong>From Alias:</strong> ${fromHeader.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</li>
        <li><strong>Admin Recipient:</strong> ${adminEmail}</li>
      </ul>
      <p style="font-size: 12px; color: #71717A; margin-bottom: 0;">
        Receiving this email in your inbox confirms end-to-end delivery from PDFNestly via Private Email SMTP.
      </p>
    </div>
  </body>
</html>`,
    });

    const acceptedCount = info.accepted ? info.accepted.length : 0;
    const rejectedCount = info.rejected ? info.rejected.length : 0;
    const messageSubmitted = acceptedCount > 0 && rejectedCount === 0;

    return {
      connectionVerified: true,
      messageSubmitted,
      messageId: info.messageId || null,
      acceptedCount,
      rejectedCount,
      provider: 'private_email',
      errorCategory: messageSubmitted ? 'none' : 'recipient_rejected',
      sanitizedMessage: messageSubmitted
        ? `SMTP server (mail.privateemail.com) accepted the test message for delivery to ${adminEmail}. Note: SMTP acceptance confirms handoff to the mail server; please check the ${adminEmail} inbox and spam folder to confirm final receipt.`
        : 'SMTP connection succeeded, but the mail server did not accept the recipient address.',
    };
  } catch (err) {
    const classified = classifySmtpError(err);
    return {
      connectionVerified,
      messageSubmitted: false,
      messageId: null,
      acceptedCount: 0,
      rejectedCount: 0,
      provider: 'private_email',
      errorCategory: classified.category,
      sanitizedMessage: classified.sanitizedMessage,
    };
  }
}
