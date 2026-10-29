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
  validateSessionToken,
  verifyEmailWithToken,
  createPasswordResetRequest,
  resetPasswordWithToken,
  recordActivityAndJobEvent,
  getUserDashboardData,
  getAdminOverviewMetrics,
  adminUpdateUserStatus,
  adminUpdateUserRole,
  adminDeleteUser,
  updateSystemSettings,
  listAdminAuditLogs,
} from './platform-store';

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

  // 6. Password reset clears lockout and updates password
  const resetReq = createPasswordResetRequest('alice@example.com');
  assert.equal(resetReq.accepted, true);
  assert.ok(resetReq.resetToken);

  resetPasswordWithToken({
    email: 'alice@example.com',
    token: resetReq.resetToken!,
    newPassword: 'UpdatedPass456',
  });

  const loginAfterReset = authenticateEmailUser({
    email: 'alice@example.com',
    password: 'UpdatedPass456',
  });
  assert.equal(loginAfterReset.user.uid, reg.user.uid);
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

  if (fs.existsSync(testDbFile)) {
    fs.unlinkSync(testDbFile);
  }
});
