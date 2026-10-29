import test from 'node:test';
import assert from 'node:assert/strict';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';

// Isolate test database file in os.tmpdir()
const testDbFile = path.join(
  os.tmpdir(),
  `pdfnestly-test-db-${process.pid}-${Date.now()}.json`
);
process.env.PDFNESTLY_DB_FILE = testDbFile;

import {
  resetDatabaseForTesting,
  registerEmailUser,
  authenticateEmailUser,
  syncFirebaseAuthenticatedUser,
  validateSessionToken,
  verifyEmailWithToken,
  createPasswordResetRequest,
  resetPasswordWithToken,
  hashResetToken,
  hashVerificationToken,
  updateUserProfile,
  getSessionCookieName,
  recordActivityAndJobEvent,
  getUserDashboardData,
  getAdminOverviewMetrics,
  adminUpdateUserStatus,
  adminUpdateUserRole,
  adminDeleteUser,
  updateSystemSettings,
  listAdminAuditLogs,
} from './platform-store';
import {
  setPasswordResetTestTransport,
  setEmailVerificationTestTransport,
  setMockSmtpTransport,
  classifySmtpError,
  type PasswordResetEmailPayload,
  type EmailVerificationPayload,
  type MockSmtpSendMailOptions,
} from './password-reset-mailer';
import { POST as forgotPasswordPost } from '../app/api/auth/forgot-password/route';
import { POST as registerPost } from '../app/api/auth/register/route';
import { POST as verifyEmailPost } from '../app/api/auth/verify-email/route';
import {
  GET as adminEmailDiagGet,
  POST as adminEmailDiagPost,
} from '../app/api/admin/email-diagnostics/route';
import { NextRequest } from 'next/server';

test('User registration, email verification, login, and brute-force protection', () => {
  resetDatabaseForTesting();

  // 1. Reject weak password
  assert.throws(() => {
    registerEmailUser({
      email: 'alice@example.com',
      password: 'short',
      displayName: 'Alice Tester',
    });
  }, /at least 8 characters/);

  // 2. Register standard user (non-admin)
  const reg = registerEmailUser({
    email: 'alice@example.com',
    password: 'SecurePass123',
    displayName: 'Alice Tester',
  });
  assert.equal(reg.user.email, 'alice@example.com');
  assert.equal(reg.user.role, 'user');
  assert.equal(reg.user.status, 'active');
  assert.equal(reg.user.emailVerified, false);
  assert.ok(reg.sessionToken.length > 20);

  // 3. Validate session token
  const sessionCheck = validateSessionToken(reg.sessionToken);
  assert.ok(sessionCheck);
  assert.equal(sessionCheck.user.uid, reg.user.uid);

  // 4. Verify email with token
  const verifiedUser = verifyEmailWithToken(reg.user.uid, reg.verificationToken);
  assert.equal(verifiedUser.emailVerified, true);

  // 5. Brute-force protection after 5 failed attempts
  for (let i = 0; i < 5; i++) {
    assert.throws(() => {
      authenticateEmailUser({
        email: 'alice@example.com',
        password: 'WrongPassword999',
      });
    });
  }
  assert.throws(() => {
    authenticateEmailUser({
      email: 'alice@example.com',
      password: 'SecurePass123',
    });
  }, /temporarily locked/);

  // 6. Password reset clears lockout, revokes prior session, and updates password
  const resetReq = createPasswordResetRequest('alice@example.com');
  assert.equal(resetReq.accepted, true);
  assert.ok(resetReq.resetToken);

  resetPasswordWithToken({
    email: 'alice@example.com',
    token: resetReq.resetToken!,
    newPassword: 'UpdatedPass456',
  });

  // Prior session is revoked after password reset
  assert.equal(validateSessionToken(reg.sessionToken), null);

  const loginAfterReset = authenticateEmailUser({
    email: 'alice@example.com',
    password: 'UpdatedPass456',
  });
  assert.equal(loginAfterReset.user.uid, reg.user.uid);
});

test('Password reset security: API never leaks token/resetUrl, hashes at rest, enforces single-use & expiry, and prevents email-only reset', async () => {
  resetDatabaseForTesting();

  const alice = registerEmailUser({
    email: 'alice.sec@example.com',
    password: 'OriginalAlicePass1',
    displayName: 'Alice Security',
  });
  const bob = registerEmailUser({
    email: 'bob.sec@example.com',
    password: 'OriginalBobPass1',
    displayName: 'Bob Security',
  });

  // 1. API request when no email provider is configured:
  //    - Never contains resetToken, token, or resetUrl
  //    - Does not pretend an email was sent (emailSent: false, emailDeliveryConfigured: false)
  //    - Response is identical for existing and non-existing accounts
  setPasswordResetTestTransport(null);

  const reqExistingNoProvider = new NextRequest(
    'https://pdfnestly.com/api/auth/forgot-password',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '203.0.113.10',
      },
      body: JSON.stringify({
        action: 'request',
        email: 'alice.sec@example.com',
      }),
    }
  );
  const resExistingNoProvider = await forgotPasswordPost(reqExistingNoProvider);
  assert.equal(resExistingNoProvider.status, 200);
  const bodyExistingNoProvider = await resExistingNoProvider.json();

  assert.equal(bodyExistingNoProvider.accepted, true);
  assert.equal(bodyExistingNoProvider.emailSent, false);
  assert.equal(bodyExistingNoProvider.emailDeliveryConfigured, false);
  assert.equal('resetUrl' in bodyExistingNoProvider, false);
  assert.equal('resetToken' in bodyExistingNoProvider, false);
  assert.equal('token' in bodyExistingNoProvider, false);
  assert.equal(
    JSON.stringify(bodyExistingNoProvider).includes('token='),
    false
  );

  const reqNonExistingNoProvider = new NextRequest(
    'https://pdfnestly.com/api/auth/forgot-password',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '203.0.113.11',
      },
      body: JSON.stringify({
        action: 'request',
        email: 'unknown.user@example.com',
      }),
    }
  );
  const resNonExistingNoProvider = await forgotPasswordPost(
    reqNonExistingNoProvider
  );
  const bodyNonExistingNoProvider = await resNonExistingNoProvider.json();
  assert.deepEqual(bodyExistingNoProvider, bodyNonExistingNoProvider);

  // 2. API request when email provider IS configured:
  //    - Dispatches email out-of-band via transport
  //    - API HTTP response still NEVER contains resetToken, token, or resetUrl
  const sentEmails: PasswordResetEmailPayload[] = [];
  setPasswordResetTestTransport((payload) => {
    sentEmails.push(payload);
  });

  const reqWithProvider = new NextRequest(
    'https://pdfnestly.com/api/auth/forgot-password',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '203.0.113.12',
      },
      body: JSON.stringify({
        action: 'request',
        email: 'alice.sec@example.com',
      }),
    }
  );
  const resWithProvider = await forgotPasswordPost(reqWithProvider);
  assert.equal(resWithProvider.status, 200);
  const bodyWithProvider = await resWithProvider.json();

  assert.equal(bodyWithProvider.accepted, true);
  assert.equal(bodyWithProvider.emailSent, true);
  assert.equal('resetUrl' in bodyWithProvider, false);
  assert.equal('resetToken' in bodyWithProvider, false);
  assert.equal('token' in bodyWithProvider, false);
  assert.equal(sentEmails.length, 1);
  assert.equal(sentEmails[0].to, 'alice.sec@example.com');

  const emailedUrl = new URL(sentEmails[0].resetUrl);
  const emailedToken = emailedUrl.searchParams.get('token') || '';
  assert.match(emailedToken, /^[a-f0-9]{64}$/);
  assert.equal(
    JSON.stringify(bodyWithProvider).includes(emailedToken),
    false,
    'API response must never contain the emailed reset token'
  );

  // 3. Verify token is hashed at rest in the JSON database file (never stored in plaintext)
  const rawDbJson = fs.readFileSync(testDbFile, 'utf8');
  assert.equal(
    rawDbJson.includes(emailedToken),
    false,
    'Raw reset token must never be stored in plaintext on disk'
  );
  assert.equal(
    rawDbJson.includes(hashResetToken(emailedToken)),
    true,
    'SHA-256 digest of reset token must be stored at rest'
  );

  // 4. Knowing an email address alone cannot reset its password (missing, empty, invalid, or hashed token)
  for (const badToken of [
    '',
    'invalid-token',
    '0'.repeat(64),
    hashResetToken(emailedToken),
  ]) {
    assert.throws(() => {
      resetPasswordWithToken({
        email: 'alice.sec@example.com',
        token: badToken,
        newPassword: 'HackedPassword123',
      });
    }, /Invalid or expired password reset token/);
  }

  // Also test via POST /api/auth/forgot-password confirm endpoint with email only / invalid token
  const badConfirmReq = new NextRequest(
    'https://pdfnestly.com/api/auth/forgot-password',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '203.0.113.13',
      },
      body: JSON.stringify({
        action: 'confirm',
        email: 'alice.sec@example.com',
        token: 'a'.repeat(64),
        newPassword: 'HackedPassword123',
      }),
    }
  );
  const badConfirmRes = await forgotPasswordPost(badConfirmReq);
  assert.equal(badConfirmRes.status, 400);

  // Alice's original password still works and hacked password fails
  assert.throws(() => {
    authenticateEmailUser({
      email: 'alice.sec@example.com',
      password: 'HackedPassword123',
    });
  });
  const stillOriginal = authenticateEmailUser({
    email: 'alice.sec@example.com',
    password: 'OriginalAlicePass1',
  });
  assert.equal(stillOriginal.user.uid, alice.user.uid);

  // 5. Concurrent reset request invalidates the earlier token
  const firstReq = createPasswordResetRequest('alice.sec@example.com');
  const secondReq = createPasswordResetRequest('alice.sec@example.com');
  assert.ok(firstReq.resetToken);
  assert.ok(secondReq.resetToken);
  assert.notEqual(firstReq.resetToken, secondReq.resetToken);

  assert.throws(() => {
    resetPasswordWithToken({
      email: 'alice.sec@example.com',
      token: firstReq.resetToken!,
      newPassword: 'SecondTryPassword123',
    });
  }, /Invalid or expired password reset token/);

  // 6. Alice's valid token cannot be used to reset Bob's password
  assert.throws(() => {
    resetPasswordWithToken({
      email: 'bob.sec@example.com',
      token: secondReq.resetToken!,
      newPassword: 'BobHijackedPassword123',
    });
  }, /Invalid or expired password reset token/);

  // 7. Expired token is rejected
  const dbBeforeExpiry = JSON.parse(fs.readFileSync(testDbFile, 'utf8'));
  const aliceRecord = dbBeforeExpiry.users.find(
    (u: { email: string }) => u.email === 'alice.sec@example.com'
  );
  aliceRecord.resetTokenExpiresAt = new Date(Date.now() - 60_000).toISOString();
  fs.writeFileSync(testDbFile, JSON.stringify(dbBeforeExpiry, null, 2), 'utf8');

  assert.throws(() => {
    resetPasswordWithToken({
      email: 'alice.sec@example.com',
      token: secondReq.resetToken!,
      newPassword: 'ExpiredAttemptPassword123',
    });
  }, /Invalid or expired password reset token/);

  // 8. Issue a fresh valid token, confirm via API, verify it works ONCE and then becomes invalid
  const freshReq = createPasswordResetRequest('alice.sec@example.com');
  assert.ok(freshReq.resetToken);

  const validConfirmReq = new NextRequest(
    'https://pdfnestly.com/api/auth/forgot-password',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '203.0.113.14',
      },
      body: JSON.stringify({
        action: 'confirm',
        token: freshReq.resetToken,
        newPassword: 'NewValidAlicePassword99',
      }),
    }
  );
  const validConfirmRes = await forgotPasswordPost(validConfirmReq);
  assert.equal(validConfirmRes.status, 200);
  const validConfirmBody = await validConfirmRes.json();
  assert.equal(validConfirmBody.success, true);
  assert.equal('user' in validConfirmBody, false);

  // Re-using the exact same token a second time MUST fail
  assert.throws(() => {
    resetPasswordWithToken({
      email: 'alice.sec@example.com',
      token: freshReq.resetToken!,
      newPassword: 'ReuseTokenPassword88',
    });
  }, /Invalid or expired password reset token/);

  // 9. Verify Alice's password was updated and Bob's account was untouched
  assert.throws(() => {
    authenticateEmailUser({
      email: 'alice.sec@example.com',
      password: 'OriginalAlicePass1',
    });
  });
  const aliceNewLogin = authenticateEmailUser({
    email: 'alice.sec@example.com',
    password: 'NewValidAlicePassword99',
  });
  assert.equal(aliceNewLogin.user.uid, alice.user.uid);

  const bobLogin = authenticateEmailUser({
    email: 'bob.sec@example.com',
    password: 'OriginalBobPass1',
  });
  assert.equal(bobLogin.user.uid, bob.user.uid);

  // 10. Verify Google OAuth synchronization continues working seamlessly
  const googleSynced = syncFirebaseAuthenticatedUser({
    uid: 'firebase_google_uid_123',
    email: 'google.user@example.com',
    displayName: 'Google OAuth User',
    provider: 'google',
    emailVerified: true,
  });
  assert.equal(googleSynced.user.email, 'google.user@example.com');
  assert.equal(googleSynced.user.provider, 'google');
  assert.equal(googleSynced.user.role, 'user');
  assert.ok(validateSessionToken(googleSynced.sessionToken));

  setPasswordResetTestTransport(null);
});

test('Bootstrap admin role assignment, PDF job tracking, deduplication, and Admin RBAC audit logs', () => {
  resetDatabaseForTesting();

  // 1. Register runtime bootstrap admin email
  const adminReg = registerEmailUser({
    email: 'rfjatt002@gmail.com',
    password: 'AdminPassword123',
    displayName: 'Raj Admin',
  });
  assert.equal(adminReg.user.role, 'admin');
  assert.equal(adminReg.user.emailVerified, true);

  // 2. Register standard user
  const memberReg = registerEmailUser({
    email: 'bob@example.com',
    password: 'BobPassword123',
    displayName: 'Bob Member',
  });
  assert.equal(memberReg.user.role, 'user');

  // 3. Record PDF processing job start & completion with deduplication
  const started = recordActivityAndJobEvent({
    userId: memberReg.user.uid,
    userEmail: memberReg.user.email,
    anonymousSessionId: null,
    eventType: 'pdf_processing_started',
    toolSlug: 'merge-pdf',
    toolName: 'Merge PDF',
    status: 'started',
    fileSizeBytes: 125000,
    jobId: 'job_test_merge_001',
    dedupeKey: 'dedupe_start_001',
  });
  assert.ok(started.job);
  assert.equal(started.job.status, 'processing');

  // Duplicate dedupeKey must return the exact same event without duplicating
  const duplicateStart = recordActivityAndJobEvent({
    userId: memberReg.user.uid,
    userEmail: memberReg.user.email,
    anonymousSessionId: null,
    eventType: 'pdf_processing_started',
    toolSlug: 'merge-pdf',
    toolName: 'Merge PDF',
    status: 'started',
    fileSizeBytes: 125000,
    jobId: 'job_test_merge_001',
    dedupeKey: 'dedupe_start_001',
  });
  assert.equal(duplicateStart.event.id, started.event.id);

  // Complete the PDF job
  const completed = recordActivityAndJobEvent({
    userId: memberReg.user.uid,
    userEmail: memberReg.user.email,
    anonymousSessionId: null,
    eventType: 'pdf_processing_completed',
    toolSlug: 'merge-pdf',
    toolName: 'Merge PDF',
    status: 'succeeded',
    fileSizeBytes: 125000,
    outputSizeBytes: 118000,
    durationMs: 340,
    jobId: 'job_test_merge_001',
  });
  assert.equal(completed.job?.status, 'completed');

  const dash = getUserDashboardData(memberReg.user.uid);
  assert.equal(dash.stats.totalJobs, 1);
  assert.equal(dash.stats.completedJobs, 1);
  assert.equal(dash.profile.pdfJobsCount, 1);

  // 4. Admin overview metrics reflect real database state
  const overview = getAdminOverviewMetrics(30);
  assert.ok(overview.users.total >= 2);
  assert.equal(overview.jobs.total, 1);
  assert.equal(overview.jobs.succeeded, 1);
  assert.equal(overview.topTools[0].toolSlug, 'merge-pdf');

  // 5. Admin suspends member -> member session is immediately revoked
  const suspended = adminUpdateUserStatus({
    adminUid: adminReg.user.uid,
    adminEmail: adminReg.user.email,
    targetUid: memberReg.user.uid,
    newStatus: 'suspended',
    reason: 'Policy violation test',
  });
  assert.equal(suspended.user.status, 'suspended');
  assert.equal(validateSessionToken(memberReg.sessionToken), null);

  // 6. Admin cannot suspend or demote own sole admin account
  assert.throws(() => {
    adminUpdateUserStatus({
      adminUid: adminReg.user.uid,
      adminEmail: adminReg.user.email,
      targetUid: adminReg.user.uid,
      newStatus: 'suspended',
    });
  }, /cannot suspend your own/);

  assert.throws(() => {
    adminUpdateUserRole({
      adminUid: adminReg.user.uid,
      adminEmail: adminReg.user.email,
      targetUid: adminReg.user.uid,
      newRole: 'user',
    });
  }, /cannot demote your own/);

  // 7. Admin updates system settings and deletes suspended member
  updateSystemSettings({
    adminUid: adminReg.user.uid,
    adminEmail: adminReg.user.email,
    patch: { rateLimitPerMinute: 180 },
  });

  adminDeleteUser({
    adminUid: adminReg.user.uid,
    adminEmail: adminReg.user.email,
    targetUid: memberReg.user.uid,
  });

  const auditLogs = listAdminAuditLogs(20);
  assert.ok(auditLogs.some((l) => l.action === 'user.suspended'));
  assert.ok(auditLogs.some((l) => l.action === 'settings.updated'));
  assert.ok(auditLogs.some((l) => l.action === 'user.deleted'));
});

test('Email verification security, domain separation from password-reset tokens, and Private Email SMTP diagnostics', async () => {
  resetDatabaseForTesting();
  setPasswordResetTestTransport(null);
  setEmailVerificationTestTransport(null);
  setMockSmtpTransport(null);

  // 1. Register via POST /api/auth/register with mocked verification mailer:
  //    - Sends verification email via transport
  //    - Never returns verificationToken or verificationUrl in HTTP JSON response
  const verificationEmails: EmailVerificationPayload[] = [];
  setEmailVerificationTestTransport((payload) => {
    verificationEmails.push(payload);
  });

  const regReq = new NextRequest('https://pdfnestly.com/api/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': '198.51.100.21',
    },
    body: JSON.stringify({
      email: 'claire.verify@example.com',
      password: 'ClairePassword123',
      displayName: 'Claire Verifier',
    }),
  });
  const regRes = await registerPost(regReq);
  assert.equal(regRes.status, 201);
  const regBody = await regRes.json();

  assert.equal(regBody.user.email, 'claire.verify@example.com');
  assert.equal(regBody.user.emailVerified, false);
  assert.equal(regBody.emailSent, true);
  assert.equal('verificationToken' in regBody, false);
  assert.equal('verificationUrl' in regBody, false);
  assert.equal(verificationEmails.length, 1);
  assert.equal(verificationEmails[0].to, 'claire.verify@example.com');

  const emailedVerifyUrl = new URL(verificationEmails[0].verificationUrl);
  const firstVerifyToken = emailedVerifyUrl.searchParams.get('token') || '';
  const claireUid = emailedVerifyUrl.searchParams.get('uid') || '';
  assert.match(firstVerifyToken, /^[a-f0-9]{64}$/);
  assert.equal(claireUid, regBody.user.uid);
  assert.equal(
    JSON.stringify(regBody).includes(firstVerifyToken),
    false,
    'Registration API response must never contain the raw verification token'
  );

  // 2. Verify token is hashed at rest in the database (never plaintext)
  const rawDb = fs.readFileSync(testDbFile, 'utf8');
  assert.equal(rawDb.includes(firstVerifyToken), false);
  assert.equal(
    rawDb.includes(hashVerificationToken(firstVerifyToken)),
    true,
    'SHA-256 domain-separated digest of verification token must be stored at rest'
  );

  // 3. Unverified email user is blocked from modifying profile/password settings
  assert.throws(() => {
    updateUserProfile(claireUid, { displayName: 'Unauthorized Name Change' });
  }, /verify your email address/);

  // 4. Requesting a password reset does NOT mark email as verified, and password-reset token
  //    CANNOT be used as an email-verification token (nor vice versa)
  const resetReq = createPasswordResetRequest('claire.verify@example.com');
  assert.ok(resetReq.resetToken);

  assert.throws(() => {
    verifyEmailWithToken(claireUid, resetReq.resetToken!);
  }, /Invalid or expired email verification token/);

  assert.throws(() => {
    resetPasswordWithToken({
      email: 'claire.verify@example.com',
      token: firstVerifyToken,
      newPassword: 'CrossTokenHackPassword123',
    });
  }, /Invalid or expired password reset token/);

  // 5. Resending verification email via POST /api/auth/verify-email (action: 'resend'):
  //    - Never returns verificationToken or verificationUrl in response
  //    - Supersedes and invalidates the previous verification token
  const sessionCookieName = getSessionCookieName();
  const resendReq = new NextRequest(
    'https://pdfnestly.com/api/auth/verify-email',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '198.51.100.22',
        cookie: `${sessionCookieName}=${regBody.sessionToken}`,
      },
      body: JSON.stringify({ action: 'resend' }),
    }
  );
  const resendRes = await verifyEmailPost(resendReq);
  assert.equal(resendRes.status, 200);
  const resendBody = await resendRes.json();
  assert.equal(resendBody.success, true);
  assert.equal(resendBody.emailSent, true);
  assert.equal('verificationToken' in resendBody, false);
  assert.equal('verificationUrl' in resendBody, false);
  assert.equal(verificationEmails.length, 2);

  const secondVerifyToken =
    new URL(verificationEmails[1].verificationUrl).searchParams.get('token') ||
    '';
  assert.match(secondVerifyToken, /^[a-f0-9]{64}$/);
  assert.notEqual(firstVerifyToken, secondVerifyToken);

  // First token is now superseded and rejected
  assert.throws(() => {
    verifyEmailWithToken(claireUid, firstVerifyToken);
  }, /Invalid or expired email verification token/);

  // 6. Expired verification token is rejected
  const dbSnapshot = JSON.parse(fs.readFileSync(testDbFile, 'utf8'));
  const claireRecord = dbSnapshot.users.find(
    (u: { uid: string }) => u.uid === claireUid
  );
  claireRecord.verificationTokenExpiresAt = new Date(
    Date.now() - 60_000
  ).toISOString();
  fs.writeFileSync(testDbFile, JSON.stringify(dbSnapshot, null, 2), 'utf8');

  assert.throws(() => {
    verifyEmailWithToken(claireUid, secondVerifyToken);
  }, /Invalid or expired email verification token/);

  // 7. Issue fresh verification token via resend, confirm once via API, and verify reuse is rejected
  const secondResendReq = new NextRequest(
    'https://pdfnestly.com/api/auth/verify-email',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '198.51.100.23',
        cookie: `${sessionCookieName}=${regBody.sessionToken}`,
      },
      body: JSON.stringify({ action: 'resend' }),
    }
  );
  await verifyEmailPost(secondResendReq);
  const thirdVerifyToken =
    new URL(verificationEmails[2].verificationUrl).searchParams.get('token') ||
    '';

  const confirmVerifyReq = new NextRequest(
    'https://pdfnestly.com/api/auth/verify-email',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '198.51.100.24',
      },
      body: JSON.stringify({
        action: 'verify',
        uid: claireUid,
        token: thirdVerifyToken,
      }),
    }
  );
  const confirmVerifyRes = await verifyEmailPost(confirmVerifyReq);
  assert.equal(confirmVerifyRes.status, 200);
  const confirmVerifyBody = await confirmVerifyRes.json();
  assert.equal(confirmVerifyBody.success, true);
  assert.equal(confirmVerifyBody.user.emailVerified, true);

  // Reusing the same verification token a second time MUST fail
  assert.throws(() => {
    verifyEmailWithToken(claireUid, thirdVerifyToken);
  }, /Invalid or expired email verification token/);

  // Now that Claire's email is verified, she can update her profile settings
  const updatedClaire = updateUserProfile(claireUid, {
    displayName: 'Claire Verified Pro',
  });
  assert.equal(updatedClaire.displayName, 'Claire Verified Pro');

  // 8. Test Private Email SMTP mock transport, sender alias rejection classification, and Admin Diagnostics endpoint
  setEmailVerificationTestTransport(null);

  const aliasErr = Object.assign(
    new Error('553 5.7.1 <support@pdfnestly.com>: Sender address rejected: not owned by user rajpoonia@pdfnestly.com'),
    { responseCode: 553 }
  );
  const classifiedAlias = classifySmtpError(aliasErr);
  assert.equal(classifiedAlias.category, 'sender_alias_rejected');

  // Admin diagnostics endpoint rejects unauthenticated (401) and non-admin (403) callers
  const unauthDiagReq = new NextRequest(
    'https://pdfnestly.com/api/admin/email-diagnostics',
    { method: 'GET' }
  );
  const unauthDiagRes = await adminEmailDiagGet(unauthDiagReq);
  assert.equal(unauthDiagRes.status, 401);

  const nonAdminDiagReq = new NextRequest(
    'https://pdfnestly.com/api/admin/email-diagnostics',
    {
      method: 'GET',
      headers: { cookie: `${sessionCookieName}=${regBody.sessionToken}` },
    }
  );
  const nonAdminDiagRes = await adminEmailDiagGet(nonAdminDiagReq);
  assert.equal(nonAdminDiagRes.status, 403);

  // Register admin and test Admin Email Diagnostics GET & POST with mocked SMTP transport
  const adminAccount = registerEmailUser({
    email: 'rfjatt002@gmail.com',
    password: 'AdminDiagPassword123',
    displayName: 'Raj Admin',
  });

  const smtpSentMessages: MockSmtpSendMailOptions[] = [];
  setMockSmtpTransport({
    verify: async () => true,
    sendMail: async (opts) => {
      smtpSentMessages.push(opts);
      return {
        messageId: '<mock-msg-001@pdfnestly.com>',
        accepted: [opts.to],
        rejected: [],
        response: '250 2.0.0 Ok: queued',
      };
    },
  });

  // Attempting to send diagnostic test email to an arbitrary non-admin recipient is rejected (400)
  const badRecipientReq = new NextRequest(
    'https://pdfnestly.com/api/admin/email-diagnostics',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: `${sessionCookieName}=${adminAccount.sessionToken}`,
      },
      body: JSON.stringify({ recipient: 'external.target@example.com' }),
    }
  );
  const badRecipientRes = await adminEmailDiagPost(badRecipientReq);
  assert.equal(badRecipientRes.status, 400);

  // Sending diagnostic test email to the authenticated admin's own email succeeds
  const validDiagPostReq = new NextRequest(
    'https://pdfnestly.com/api/admin/email-diagnostics',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: `${sessionCookieName}=${adminAccount.sessionToken}`,
      },
      body: JSON.stringify({}),
    }
  );
  const validDiagPostRes = await adminEmailDiagPost(validDiagPostReq);
  assert.equal(validDiagPostRes.status, 200);
  const validDiagPostBody = await validDiagPostRes.json();
  assert.equal(validDiagPostBody.connectionVerified, true);
  assert.equal(validDiagPostBody.messageSubmitted, true);
  assert.equal(validDiagPostBody.recipient, 'rfjatt002@gmail.com');
  assert.equal(validDiagPostBody.errorCategory, 'none');
  assert.equal(smtpSentMessages.length, 1);
  assert.equal(smtpSentMessages[0].to, 'rfjatt002@gmail.com');

  setMockSmtpTransport(null);

  if (fs.existsSync(testDbFile)) {
    fs.unlinkSync(testDbFile);
  }
});


