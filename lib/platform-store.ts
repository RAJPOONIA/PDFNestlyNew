import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { PDF_TOOLS_REGISTRY, getToolBySlug } from './tools-registry';

export type AuthProviderType = 'google' | 'email';
export type UserRole = 'user' | 'admin';
export type AccountStatus = 'active' | 'suspended';

export type ActivityEventType =
  | 'signup_completed'
  | 'login_completed'
  | 'logout_completed'
  | 'page_viewed'
  | 'tool_opened'
  | 'pdf_upload_started'
  | 'pdf_processing_started'
  | 'pdf_processing_completed'
  | 'pdf_processing_failed'
  | 'pdf_download_completed';

export interface PlatformUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  provider: AuthProviderType;
  role: UserRole;
  status: AccountStatus;
  emailVerified: boolean;
  passwordHash?: string;
  verificationToken?: string | null;
  verificationTokenExpiresAt?: string | null;
  resetToken?: string | null;
  resetTokenExpiresAt?: string | null;
  pdfJobsCount: number;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  lastActiveAt: string | null;
}

export type SafeUserProfile = Omit<
  PlatformUser,
  | 'passwordHash'
  | 'verificationToken'
  | 'verificationTokenExpiresAt'
  | 'resetToken'
  | 'resetTokenExpiresAt'
>;

export interface UserSessionRecord {
  id: string;
  userId: string;
  userEmail: string;
  provider: AuthProviderType;
  userAgent: string;
  ipHash: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

export interface PdfJobRecord {
  id: string;
  userId: string | null;
  userEmail: string | null;
  anonymousSessionId: string | null;
  toolSlug: string;
  toolName: string;
  category: string;
  processingLocation: string;
  status: 'processing' | 'completed' | 'failed';
  fileSizeBytes: number;
  outputSizeBytes: number;
  durationMs: number;
  errorCategory: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface ActivityEventRecord {
  id: string;
  dedupeKey: string | null;
  userId: string | null;
  userEmail: string | null;
  anonymousSessionId: string | null;
  eventType: ActivityEventType;
  toolSlug: string | null;
  toolName: string | null;
  pagePath: string | null;
  status: 'info' | 'started' | 'succeeded' | 'failed';
  durationMs: number | null;
  fileSizeBytes: number | null;
  outputSizeBytes: number | null;
  errorCategory: string | null;
  jobId: string | null;
  createdAt: string;
}

export interface AdminAuditLogRecord {
  id: string;
  adminUid: string;
  adminEmail: string;
  action: string;
  targetType: 'user' | 'session' | 'settings' | 'system';
  targetId: string;
  targetLabel: string;
  summary: string;
  metadata: Record<string, string | number | boolean | null>;
  createdAt: string;
}

export interface SystemSettingsRecord {
  registrationEnabled: boolean;
  googleAuthEnabled: boolean;
  emailAuthEnabled: boolean;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  rateLimitPerMinute: number;
  maxLoginAttempts: number;
  lockoutDurationMinutes: number;
  maxUploadSizeMb: number;
  activityRetentionDays: number;
  updatedBy: string;
  updatedAt: string;
}

interface PlatformDatabaseShape {
  users: PlatformUser[];
  sessions: UserSessionRecord[];
  pdfJobs: PdfJobRecord[];
  activityEvents: ActivityEventRecord[];
  adminAuditLogs: AdminAuditLogRecord[];
  systemSettings: SystemSettingsRecord;
}

const DEFAULT_RUNTIME_ADMIN_EMAIL = 'rfjatt002@gmail.com';
const SESSION_COOKIE_NAME = 'pdfnestly_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function getSessionCookieName(): string {
  return SESSION_COOKIE_NAME;
}

function getSigningSecret(): string {
  return (
    process.env.SESSION_SECRET ||
    process.env.GEMINI_API_KEY ||
    'pdfnestly-production-hmac-signing-key-v1-953505351059'
  );
}

export function isBootstrapAdminEmail(email: string): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  const envAdmin = (process.env.INITIAL_ADMIN_EMAIL || '').trim().toLowerCase();
  return (
    normalized === DEFAULT_RUNTIME_ADMIN_EMAIL ||
    (envAdmin.length > 0 && normalized === envAdmin)
  );
}

export function toSafeUser(user: PlatformUser): SafeUserProfile {
  const {
    passwordHash: _p,
    verificationToken: _v,
    verificationTokenExpiresAt: _ve,
    resetToken: _r,
    resetTokenExpiresAt: _re,
    ...safe
  } = user;
  return safe;
}

export function hashPasswordScrypt(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPasswordScrypt(password: string, storedHash?: string): boolean {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex) return false;
  const keyBuf = Buffer.from(keyHex, 'hex');
  const derivedBuf = crypto.scryptSync(password, salt, 64);
  if (keyBuf.length !== derivedBuf.length) return false;
  return crypto.timingSafeEqual(keyBuf, derivedBuf);
}

export function hashIpAddress(ip: string): string {
  return crypto
    .createHmac('sha256', getSigningSecret())
    .update(ip || 'unknown')
    .digest('hex')
    .slice(0, 16);
}

export function signSessionToken(payload: {
  sessionId: string;
  userId: string;
  exp: number;
}): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(data)
    .digest('base64url');
  return `${data}.${sig}`;
}

export function verifySignedSessionToken(token: string): {
  sessionId: string;
  userId: string;
  exp: number;
} | null {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [data, sig] = token.split('.');
  if (!data || !sig) return null;
  const expectedSig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(data)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (!parsed.sessionId || !parsed.userId || typeof parsed.exp !== 'number') {
      return null;
    }
    if (Date.now() > parsed.exp) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

// Rate Limiting & Brute-Force Protection State
interface RateBucket {
  count: number;
  resetAt: number;
}

interface LoginAttemptBucket {
  failures: number;
  lockedUntil: number;
  lastAttemptAt: number;
}

declare global {
  var _pdfnestlyDbCache: PlatformDatabaseShape | undefined;
  var _pdfnestlyRateLimits: Map<string, RateBucket> | undefined;
  var _pdfnestlyLoginAttempts: Map<string, LoginAttemptBucket> | undefined;
}

function getRateLimitMap(): Map<string, RateBucket> {
  if (!global._pdfnestlyRateLimits) {
    global._pdfnestlyRateLimits = new Map();
  }
  return global._pdfnestlyRateLimits;
}

function getLoginAttemptMap(): Map<string, LoginAttemptBucket> {
  if (!global._pdfnestlyLoginAttempts) {
    global._pdfnestlyLoginAttempts = new Map();
  }
  return global._pdfnestlyLoginAttempts;
}

export function checkRateLimit(
  key: string,
  limitPerMinute?: number
): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
  const db = loadDatabase();
  const maxReqs = limitPerMinute ?? db.systemSettings.rateLimitPerMinute ?? 120;
  const now = Date.now();
  const windowMs = 60_000;
  const map = getRateLimitMap();
  const bucket = map.get(key);

  if (!bucket || now >= bucket.resetAt) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: Math.max(0, maxReqs - 1), retryAfterSeconds: 0 };
  }

  if (bucket.count >= maxReqs) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  bucket.count += 1;
  return {
    allowed: true,
    remaining: Math.max(0, maxReqs - bucket.count),
    retryAfterSeconds: 0,
  };
}

export function checkBruteForceLockout(identifier: string): {
  locked: boolean;
  retryAfterSeconds: number;
} {
  const key = identifier.trim().toLowerCase();
  const map = getLoginAttemptMap();
  const entry = map.get(key);
  const now = Date.now();
  if (!entry) return { locked: false, retryAfterSeconds: 0 };
  if (entry.lockedUntil > now) {
    return {
      locked: true,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.lockedUntil - now) / 1000)),
    };
  }
  return { locked: false, retryAfterSeconds: 0 };
}

export function recordFailedLoginAttempt(identifier: string): {
  failures: number;
  locked: boolean;
  retryAfterSeconds: number;
} {
  const db = loadDatabase();
  const maxAttempts = db.systemSettings.maxLoginAttempts || 5;
  const lockoutMs = (db.systemSettings.lockoutDurationMinutes || 15) * 60_000;
  const key = identifier.trim().toLowerCase();
  const map = getLoginAttemptMap();
  const now = Date.now();
  const existing = map.get(key);

  const failures =
    existing && now - existing.lastAttemptAt < lockoutMs
      ? existing.failures + 1
      : 1;
  const lockedUntil = failures >= maxAttempts ? now + lockoutMs : 0;

  map.set(key, {
    failures,
    lockedUntil,
    lastAttemptAt: now,
  });

  return {
    failures,
    locked: lockedUntil > now,
    retryAfterSeconds: lockedUntil > now ? Math.ceil(lockoutMs / 1000) : 0,
  };
}

export function clearFailedLoginAttempts(identifier: string): void {
  const key = identifier.trim().toLowerCase();
  getLoginAttemptMap().delete(key);
}

// Persistent Storage File Path
function getDatabaseFilePath(): string {
  if (process.env.PDFNESTLY_DB_FILE) {
    return process.env.PDFNESTLY_DB_FILE;
  }
  return path.join(process.cwd(), '.data', 'pdfnestly-platform.json');
}

function createInitialDatabaseState(): PlatformDatabaseShape {
  const nowIso = new Date().toISOString();
  const bootstrapAdminEmail =
    (process.env.INITIAL_ADMIN_EMAIL || DEFAULT_RUNTIME_ADMIN_EMAIL)
      .trim()
      .toLowerCase();

  const initialUsers: PlatformUser[] = [
    {
      uid: 'usr_admin_bootstrap',
      email: bootstrapAdminEmail,
      displayName: 'PDFNestly Administrator',
      photoURL: '',
      provider: 'google',
      role: 'admin',
      status: 'active',
      emailVerified: true,
      pdfJobsCount: 0,
      createdAt: nowIso,
      updatedAt: nowIso,
      lastLoginAt: null,
      lastActiveAt: nowIso,
    },
  ];

  // If INITIAL_ADMIN_EMAIL was set to a custom address, also ensure rfjatt002@gmail.com is registered as admin
  if (bootstrapAdminEmail !== DEFAULT_RUNTIME_ADMIN_EMAIL) {
    initialUsers.push({
      uid: 'usr_admin_runtime',
      email: DEFAULT_RUNTIME_ADMIN_EMAIL,
      displayName: 'Primary Platform Admin',
      photoURL: '',
      provider: 'google',
      role: 'admin',
      status: 'active',
      emailVerified: true,
      pdfJobsCount: 0,
      createdAt: nowIso,
      updatedAt: nowIso,
      lastLoginAt: null,
      lastActiveAt: nowIso,
    });
  }

  return {
    users: initialUsers,
    sessions: [],
    pdfJobs: [],
    activityEvents: [],
    adminAuditLogs: [
      {
        id: `audit_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
        adminUid: 'usr_admin_bootstrap',
        adminEmail: bootstrapAdminEmail,
        action: 'system.bootstrapped',
        targetType: 'system',
        targetId: 'global',
        targetLabel: 'PDFNestly Platform Security & RBAC',
        summary: `Initialized PDFNestly platform store and designated ${bootstrapAdminEmail} as bootstrap administrator.`,
        metadata: { bootstrapEmail: bootstrapAdminEmail },
        createdAt: nowIso,
      },
    ],
    systemSettings: {
      registrationEnabled: true,
      googleAuthEnabled: true,
      emailAuthEnabled: true,
      maintenanceMode: false,
      maintenanceMessage:
        'PDFNestly is undergoing scheduled maintenance. Public PDF tools remain available.',
      rateLimitPerMinute: 120,
      maxLoginAttempts: 5,
      lockoutDurationMinutes: 15,
      maxUploadSizeMb: Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_SIZE_MB || 50),
      activityRetentionDays: 90,
      updatedBy: 'usr_admin_bootstrap',
      updatedAt: nowIso,
    },
  };
}

export function loadDatabase(): PlatformDatabaseShape {
  const dbFile = getDatabaseFilePath();
  if (global._pdfnestlyDbCache && !process.env.PDFNESTLY_DB_FILE) {
    return global._pdfnestlyDbCache;
  }

  try {
    if (fs.existsSync(dbFile)) {
      const raw = fs.readFileSync(dbFile, 'utf8');
      const parsed = JSON.parse(raw) as PlatformDatabaseShape;
      if (parsed && Array.isArray(parsed.users)) {
        global._pdfnestlyDbCache = parsed;
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Initializing fresh platform database store:', err);
  }

  const initial = createInitialDatabaseState();
  saveDatabase(initial);
  return initial;
}

export function saveDatabase(db: PlatformDatabaseShape): void {
  global._pdfnestlyDbCache = db;
  const dbFile = getDatabaseFilePath();
  try {
    const dir = path.dirname(dbFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tmpFile = `${dbFile}.tmp.${process.pid}.${Date.now()}`;
    fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), 'utf8');
    fs.renameSync(tmpFile, dbFile);
  } catch (err) {
    console.error('Failed to persist platform database to disk:', err);
  }
}

export function resetDatabaseForTesting(): void {
  global._pdfnestlyDbCache = undefined;
  global._pdfnestlyRateLimits = undefined;
  global._pdfnestlyLoginAttempts = undefined;
  const dbFile = getDatabaseFilePath();
  if (fs.existsSync(dbFile)) {
    fs.unlinkSync(dbFile);
  }
  loadDatabase();
}

// ============================================================================
// Authentication & User Account Operations
// ============================================================================

export function validateEmailFormat(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (trimmed.length < 3 || trimmed.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

export function validatePasswordStrength(password: string): {
  valid: boolean;
  error?: string;
} {
  if (!password || typeof password !== 'string') {
    return { valid: false, error: 'Password is required.' };
  }
  if (password.length < 8) {
    return {
      valid: false,
      error: 'Password must be at least 8 characters long.',
    };
  }
  if (password.length > 128) {
    return {
      valid: false,
      error: 'Password must not exceed 128 characters.',
    };
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return {
      valid: false,
      error: 'Password must contain at least one letter and one number.',
    };
  }
  return { valid: true };
}

export function registerEmailUser(params: {
  email: string;
  password: string;
  displayName: string;
  userAgent?: string;
  ip?: string;
}): {
  user: SafeUserProfile;
  sessionToken: string;
  session: UserSessionRecord;
  verificationToken: string;
} {
  const db = loadDatabase();

  if (!db.systemSettings.registrationEnabled) {
    throw new Error('New user registrations are currently disabled by the administrator.');
  }
  if (!db.systemSettings.emailAuthEnabled) {
    throw new Error('Email & password authentication is currently disabled by the administrator.');
  }

  const normalizedEmail = params.email.trim().toLowerCase();
  if (!validateEmailFormat(normalizedEmail)) {
    throw new Error('Please provide a valid email address.');
  }

  const pwCheck = validatePasswordStrength(params.password);
  if (!pwCheck.valid) {
    throw new Error(pwCheck.error || 'Weak password.');
  }

  const cleanName = (params.displayName || '').trim().slice(0, 120);
  if (cleanName.length < 2) {
    throw new Error('Please enter your full name (at least 2 characters).');
  }

  const existing = db.users.find((u) => u.email.toLowerCase() === normalizedEmail);
  if (existing && existing.passwordHash) {
    throw new Error('An account with this email address already exists. Please sign in.');
  }

  const nowIso = new Date().toISOString();
  const verificationToken = crypto.randomBytes(32).toString('hex');
  const isBootstrapAdmin = isBootstrapAdminEmail(normalizedEmail);
  const storedVerificationHash = isBootstrapAdmin
    ? null
    : hashVerificationToken(verificationToken);
  const storedVerificationExpiry = isBootstrapAdmin
    ? null
    : new Date(Date.now() + VERIFICATION_TOKEN_EXPIRY_MS).toISOString();
  const assignedRole: UserRole = isBootstrapAdmin
    ? 'admin'
    : existing?.role || 'user';

  let userRecord: PlatformUser;

  if (existing) {
    // Upgrade pre-seeded bootstrap user with password credentials
    existing.displayName = cleanName;
    existing.passwordHash = hashPasswordScrypt(params.password);
    existing.provider = 'email';
    existing.role = assignedRole;
    existing.verificationToken = storedVerificationHash;
    existing.verificationTokenExpiresAt = storedVerificationExpiry;
    existing.updatedAt = nowIso;
    existing.lastLoginAt = nowIso;
    existing.lastActiveAt = nowIso;
    userRecord = existing;
  } else {
    userRecord = {
      uid: `usr_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`,
      email: normalizedEmail,
      displayName: cleanName,
      photoURL: '',
      provider: 'email',
      role: assignedRole,
      status: 'active',
      emailVerified: isBootstrapAdmin,
      passwordHash: hashPasswordScrypt(params.password),
      verificationToken: storedVerificationHash,
      verificationTokenExpiresAt: storedVerificationExpiry,
      resetToken: null,
      resetTokenExpiresAt: null,
      pdfJobsCount: 0,
      createdAt: nowIso,
      updatedAt: nowIso,
      lastLoginAt: nowIso,
      lastActiveAt: nowIso,
    };
    db.users.unshift(userRecord);
  }

  const { session, token } = createSessionInternal(db, {
    userId: userRecord.uid,
    userEmail: userRecord.email,
    provider: 'email',
    userAgent: params.userAgent || 'Browser',
    ip: params.ip || '127.0.0.1',
  });

  recordActivityEventInternal(db, {
    userId: userRecord.uid,
    userEmail: userRecord.email,
    anonymousSessionId: null,
    eventType: 'signup_completed',
    status: 'succeeded',
    dedupeKey: `signup_${userRecord.uid}`,
  });

  saveDatabase(db);

  return {
    user: toSafeUser(userRecord),
    sessionToken: token,
    session,
    verificationToken,
  };
}

export function authenticateEmailUser(params: {
  email: string;
  password: string;
  userAgent?: string;
  ip?: string;
}): {
  user: SafeUserProfile;
  sessionToken: string;
  session: UserSessionRecord;
} {
  const db = loadDatabase();
  if (!db.systemSettings.emailAuthEnabled) {
    throw new Error('Email & password login is currently disabled by the administrator.');
  }

  const normalizedEmail = params.email.trim().toLowerCase();
  const lockKey = `login:${normalizedEmail}`;
  const lockStatus = checkBruteForceLockout(lockKey);
  if (lockStatus.locked) {
    throw new Error(
      `Too many failed login attempts. Account login is temporarily locked. Please try again in ${Math.ceil(
        lockStatus.retryAfterSeconds / 60
      )} minute(s).`
    );
  }

  const user = db.users.find((u) => u.email.toLowerCase() === normalizedEmail);
  if (!user || !user.passwordHash || !verifyPasswordScrypt(params.password, user.passwordHash)) {
    const attempt = recordFailedLoginAttempt(lockKey);
    if (attempt.locked) {
      throw new Error(
        'Too many failed login attempts. Your account has been temporarily locked for security.'
      );
    }
    throw new Error('Invalid email address or password.');
  }

  if (user.status === 'suspended') {
    throw new Error(
      'Your account has been suspended by an administrator. Please contact support@pdfnestly.com.'
    );
  }

  clearFailedLoginAttempts(lockKey);

  // Ensure bootstrap admin always has admin role
  if (isBootstrapAdminEmail(user.email) && user.role !== 'admin') {
    user.role = 'admin';
  }

  const nowIso = new Date().toISOString();
  user.lastLoginAt = nowIso;
  user.lastActiveAt = nowIso;
  user.updatedAt = nowIso;

  const { session, token } = createSessionInternal(db, {
    userId: user.uid,
    userEmail: user.email,
    provider: 'email',
    userAgent: params.userAgent || 'Browser',
    ip: params.ip || '127.0.0.1',
  });

  recordActivityEventInternal(db, {
    userId: user.uid,
    userEmail: user.email,
    anonymousSessionId: null,
    eventType: 'login_completed',
    status: 'succeeded',
  });

  saveDatabase(db);

  return {
    user: toSafeUser(user),
    sessionToken: token,
    session,
  };
}

export function syncFirebaseAuthenticatedUser(params: {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  provider: AuthProviderType;
  emailVerified: boolean;
  userAgent?: string;
  ip?: string;
}): {
  user: SafeUserProfile;
  sessionToken: string;
  session: UserSessionRecord;
  isNewUser: boolean;
} {
  const db = loadDatabase();
  const normalizedEmail = params.email.trim().toLowerCase();

  if (params.provider === 'google' && !db.systemSettings.googleAuthEnabled) {
    throw new Error('Google OAuth sign-in is currently disabled by the administrator.');
  }

  const cleanUid = params.uid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
  let user = db.users.find(
    (u) => u.uid === cleanUid || u.email.toLowerCase() === normalizedEmail
  );
  const nowIso = new Date().toISOString();
  let isNewUser = false;

  if (!user) {
    if (!db.systemSettings.registrationEnabled) {
      throw new Error('New user registrations are currently closed by the administrator.');
    }
    isNewUser = true;
    user = {
      uid: cleanUid,
      email: normalizedEmail,
      displayName: (
        params.displayName ||
        normalizedEmail.split('@')[0] ||
        'PDFNestly User'
      ).slice(0, 120),
      photoURL: (params.photoURL || '').slice(0, 500),
      provider: params.provider,
      role: isBootstrapAdminEmail(normalizedEmail) ? 'admin' : 'user',
      status: 'active',
      emailVerified: Boolean(params.emailVerified),
      pdfJobsCount: 0,
      createdAt: nowIso,
      updatedAt: nowIso,
      lastLoginAt: nowIso,
      lastActiveAt: nowIso,
    };
    db.users.unshift(user);
  } else {
    if (user.status === 'suspended') {
      throw new Error(
        'Your account has been suspended by an administrator. Please contact support@pdfnestly.com.'
      );
    }
    // If replacing bootstrap placeholder UID with real Firebase UID, update references
    if (
      (user.uid === 'usr_admin_bootstrap' || user.uid === 'usr_admin_runtime') &&
      cleanUid !== user.uid
    ) {
      const oldUid = user.uid;
      user.uid = cleanUid;
      db.pdfJobs.forEach((j) => {
        if (j.userId === oldUid) j.userId = cleanUid;
      });
      db.activityEvents.forEach((e) => {
        if (e.userId === oldUid) e.userId = cleanUid;
      });
    }
    if (params.displayName && (!user.displayName || user.displayName === 'PDFNestly Administrator')) {
      user.displayName = params.displayName.slice(0, 120);
    }
    if (params.photoURL) {
      user.photoURL = params.photoURL.slice(0, 500);
    }
    if (params.emailVerified) {
      user.emailVerified = true;
    }
    if (isBootstrapAdminEmail(normalizedEmail)) {
      user.role = 'admin';
    }
    user.lastLoginAt = nowIso;
    user.lastActiveAt = nowIso;
    user.updatedAt = nowIso;
  }

  const { session, token } = createSessionInternal(db, {
    userId: user.uid,
    userEmail: user.email,
    provider: params.provider,
    userAgent: params.userAgent || 'Browser',
    ip: params.ip || '127.0.0.1',
  });

  recordActivityEventInternal(db, {
    userId: user.uid,
    userEmail: user.email,
    anonymousSessionId: null,
    eventType: isNewUser ? 'signup_completed' : 'login_completed',
    status: 'succeeded',
  });

  saveDatabase(db);

  return {
    user: toSafeUser(user),
    sessionToken: token,
    session,
    isNewUser,
  };
}

function createSessionInternal(
  db: PlatformDatabaseShape,
  params: {
    userId: string;
    userEmail: string;
    provider: AuthProviderType;
    userAgent: string;
    ip: string;
  }
): { session: UserSessionRecord; token: string } {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const expMs = now + SESSION_TTL_MS;
  const sessionId = `sess_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;

  const session: UserSessionRecord = {
    id: sessionId,
    userId: params.userId,
    userEmail: params.userEmail,
    provider: params.provider,
    userAgent: (params.userAgent || 'Browser').slice(0, 240),
    ipHash: hashIpAddress(params.ip),
    createdAt: nowIso,
    lastSeenAt: nowIso,
    expiresAt: new Date(expMs).toISOString(),
    revokedAt: null,
  };

  db.sessions.unshift(session);
  // Keep at most 1000 recent sessions
  if (db.sessions.length > 1000) {
    db.sessions.length = 1000;
  }

  const token = signSessionToken({
    sessionId,
    userId: params.userId,
    exp: expMs,
  });

  return { session, token };
}

export function validateSessionToken(token: string): {
  user: SafeUserProfile;
  session: UserSessionRecord;
} | null {
  const verified = verifySignedSessionToken(token);
  if (!verified) return null;

  const db = loadDatabase();
  const session = db.sessions.find((s) => s.id === verified.sessionId);
  if (!session || session.revokedAt) return null;
  if (new Date(session.expiresAt).getTime() < Date.now()) return null;

  const user = db.users.find((u) => u.uid === session.userId);
  if (!user || user.status === 'suspended') return null;

  const nowIso = new Date().toISOString();
  session.lastSeenAt = nowIso;
  user.lastActiveAt = nowIso;

  return {
    user: toSafeUser(user),
    session,
  };
}

export function getUserByUidOrEmail(uid: string, email?: string): SafeUserProfile | null {
  const db = loadDatabase();
  const cleanUid = uid.replace(/[^a-zA-Z0-9_-]/g, '');
  const user = db.users.find(
    (u) =>
      u.uid === cleanUid ||
      (email && u.email.toLowerCase() === email.trim().toLowerCase())
  );
  if (!user) return null;
  return toSafeUser(user);
}

export function revokeSessionByToken(token: string): boolean {
  const verified = verifySignedSessionToken(token);
  if (!verified) return false;
  const db = loadDatabase();
  const session = db.sessions.find((s) => s.id === verified.sessionId);
  if (!session) return false;
  session.revokedAt = new Date().toISOString();

  recordActivityEventInternal(db, {
    userId: session.userId,
    userEmail: session.userEmail,
    anonymousSessionId: null,
    eventType: 'logout_completed',
    status: 'succeeded',
  });

  saveDatabase(db);
  return true;
}

const VERIFICATION_TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
const GENERIC_EMAIL_VERIFICATION_ERROR =
  'Invalid or expired email verification token.';

/**
 * Hashes an email-verification token with domain separation ('pdfnestly-verify-v1:')
 * and prefix 'sha256-verify:' so password-reset tokens and email-verification tokens
 * are cryptographically and structurally incompatible.
 */
export function hashVerificationToken(rawToken: string): string {
  const digest = crypto
    .createHash('sha256')
    .update(`pdfnestly-verify-v1:${rawToken.trim()}`)
    .digest('hex');
  return `sha256-verify:${digest}`;
}

function verifyVerificationTokenHash(
  rawToken: string,
  storedTokenHash: string | null | undefined
): boolean {
  if (
    typeof rawToken !== 'string' ||
    !/^[a-f0-9]{48,64}$/i.test(rawToken.trim()) ||
    typeof storedTokenHash !== 'string' ||
    !storedTokenHash.startsWith('sha256-verify:')
  ) {
    return false;
  }
  const expectedHex = storedTokenHash.slice('sha256-verify:'.length);
  if (!/^[a-f0-9]{64}$/i.test(expectedHex)) {
    return false;
  }
  const candidateHash = hashVerificationToken(rawToken).slice(
    'sha256-verify:'.length
  );
  const bufA = Buffer.from(candidateHash, 'hex');
  const bufB = Buffer.from(expectedHex, 'hex');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function verifyEmailWithToken(
  uid: string,
  token: string
): SafeUserProfile {
  const rawToken = typeof token === 'string' ? token.trim() : '';
  const cleanUid = typeof uid === 'string' ? uid.trim() : '';
  const hasValidTokenShape = /^[a-f0-9]{48,64}$/i.test(rawToken);

  const db = loadDatabase();

  if (!hasValidTokenShape) {
    if (cleanUid) {
      const targetUser = db.users.find((u) => u.uid === cleanUid);
      if (targetUser) {
        const attempt = recordFailedLoginAttempt(
          `verify_confirm:${targetUser.uid}`
        );
        if (attempt.locked && targetUser.verificationToken) {
          targetUser.verificationToken = null;
          targetUser.verificationTokenExpiresAt = null;
          saveDatabase(db);
        }
      }
    }
    throw new Error(GENERIC_EMAIL_VERIFICATION_ERROR);
  }

  let matchedUser: PlatformUser | undefined;
  for (const u of db.users) {
    if (verifyVerificationTokenHash(rawToken, u.verificationToken)) {
      matchedUser = u;
    }
  }

  if (cleanUid) {
    const userByUid = db.users.find((u) => u.uid === cleanUid);
    if (!userByUid) {
      throw new Error(GENERIC_EMAIL_VERIFICATION_ERROR);
    }
    if (!matchedUser || matchedUser.uid !== userByUid.uid) {
      const attempt = recordFailedLoginAttempt(
        `verify_confirm:${userByUid.uid}`
      );
      if (attempt.locked && userByUid.verificationToken) {
        userByUid.verificationToken = null;
        userByUid.verificationTokenExpiresAt = null;
        saveDatabase(db);
      }
      throw new Error(GENERIC_EMAIL_VERIFICATION_ERROR);
    }
  }

  if (!matchedUser || matchedUser.status === 'suspended') {
    throw new Error(GENERIC_EMAIL_VERIFICATION_ERROR);
  }

  const confirmLock = checkBruteForceLockout(
    `verify_confirm:${matchedUser.uid}`
  );
  if (confirmLock.locked) {
    matchedUser.verificationToken = null;
    matchedUser.verificationTokenExpiresAt = null;
    saveDatabase(db);
    throw new Error(GENERIC_EMAIL_VERIFICATION_ERROR);
  }

  // Enforce 24-hour expiration (if verificationTokenExpiresAt is present and in the past)
  if (
    matchedUser.verificationTokenExpiresAt &&
    new Date(matchedUser.verificationTokenExpiresAt).getTime() < Date.now()
  ) {
    matchedUser.verificationToken = null;
    matchedUser.verificationTokenExpiresAt = null;
    saveDatabase(db);
    throw new Error(GENERIC_EMAIL_VERIFICATION_ERROR);
  }

  matchedUser.emailVerified = true;
  matchedUser.verificationToken = null;
  matchedUser.verificationTokenExpiresAt = null;
  matchedUser.updatedAt = new Date().toISOString();
  clearFailedLoginAttempts(`verify_confirm:${matchedUser.uid}`);
  saveDatabase(db);
  return toSafeUser(matchedUser);
}

export function generateEmailVerificationTokenForUser(uid: string): string {
  const db = loadDatabase();
  const user = db.users.find((u) => u.uid === uid);
  if (!user) {
    throw new Error('User account not found.');
  }
  const token = crypto.randomBytes(32).toString('hex');
  user.verificationToken = hashVerificationToken(token);
  user.verificationTokenExpiresAt = new Date(
    Date.now() + VERIFICATION_TOKEN_EXPIRY_MS
  ).toISOString();
  user.updatedAt = new Date().toISOString();
  clearFailedLoginAttempts(`verify_confirm:${user.uid}`);
  saveDatabase(db);
  return token;
}

const RESET_TOKEN_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes
const GENERIC_PASSWORD_RESET_ERROR =
  'Invalid or expired password reset token.';

export function hashResetToken(rawToken: string): string {
  const digest = crypto
    .createHash('sha256')
    .update(`pdfnestly-reset-v1:${rawToken.trim()}`)
    .digest('hex');
  return `sha256:${digest}`;
}

function verifyResetTokenHash(
  rawToken: string,
  storedTokenHash: string | null | undefined
): boolean {
  if (
    typeof rawToken !== 'string' ||
    !/^[a-f0-9]{48,64}$/i.test(rawToken.trim()) ||
    typeof storedTokenHash !== 'string' ||
    !storedTokenHash.startsWith('sha256:')
  ) {
    return false;
  }
  const expectedHex = storedTokenHash.slice('sha256:'.length);
  if (!/^[a-f0-9]{64}$/i.test(expectedHex)) {
    return false;
  }
  const candidateHash = hashResetToken(rawToken).slice('sha256:'.length);
  const bufA = Buffer.from(candidateHash, 'hex');
  const bufB = Buffer.from(expectedHex, 'hex');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function createPasswordResetRequest(email: string): {
  accepted: boolean;
  resetToken?: string;
  uid?: string;
  expiresInMinutes: number;
} {
  const expiresInMinutes = Math.round(RESET_TOKEN_EXPIRY_MS / 60000);
  if (!email || typeof email !== 'string') {
    return { accepted: true, expiresInMinutes };
  }
  const db = loadDatabase();
  const normalized = email.trim().toLowerCase();
  if (!validateEmailFormat(normalized)) {
    return { accepted: true, expiresInMinutes };
  }
  const user = db.users.find((u) => u.email.toLowerCase() === normalized);
  if (!user || user.status === 'suspended') {
    // Always return accepted: true to prevent email enumeration
    return { accepted: true, expiresInMinutes };
  }
  // Generate a 256-bit (32-byte) cryptographically random single-use token.
  // Store ONLY its SHA-256 digest at rest; overwrite any previous pending token.
  const resetToken = crypto.randomBytes(32).toString('hex');
  user.resetToken = hashResetToken(resetToken);
  user.resetTokenExpiresAt = new Date(
    Date.now() + RESET_TOKEN_EXPIRY_MS
  ).toISOString();
  user.updatedAt = new Date().toISOString();
  clearFailedLoginAttempts(`reset_confirm:${user.uid}`);
  saveDatabase(db);
  return {
    accepted: true,
    resetToken,
    uid: user.uid,
    expiresInMinutes,
  };
}

export function resetPasswordWithToken(params: {
  email?: string;
  token: string;
  newPassword: string;
}): SafeUserProfile {
  const pwCheck = validatePasswordStrength(params.newPassword || '');
  if (!pwCheck.valid) {
    throw new Error(pwCheck.error || 'Weak password.');
  }

  const rawToken = typeof params.token === 'string' ? params.token.trim() : '';
  const hasValidTokenShape = /^[a-f0-9]{48,64}$/i.test(rawToken);
  const normalizedEmail =
    typeof params.email === 'string' ? params.email.trim().toLowerCase() : '';

  const db = loadDatabase();

  if (!hasValidTokenShape) {
    if (normalizedEmail) {
      const targetByEmail = db.users.find(
        (u) => u.email.toLowerCase() === normalizedEmail
      );
      if (targetByEmail) {
        const attempt = recordFailedLoginAttempt(
          `reset_confirm:${targetByEmail.uid}`
        );
        if (attempt.locked && targetByEmail.resetToken) {
          targetByEmail.resetToken = null;
          targetByEmail.resetTokenExpiresAt = null;
          saveDatabase(db);
        }
      }
    }
    throw new Error(GENERIC_PASSWORD_RESET_ERROR);
  }

  let matchedUser: PlatformUser | undefined;
  for (const u of db.users) {
    if (verifyResetTokenHash(rawToken, u.resetToken)) {
      matchedUser = u;
    }
  }

  if (normalizedEmail) {
    const userByEmail = db.users.find(
      (u) => u.email.toLowerCase() === normalizedEmail
    );
    if (!userByEmail || !matchedUser || userByEmail.uid !== matchedUser.uid) {
      if (userByEmail) {
        const attempt = recordFailedLoginAttempt(
          `reset_confirm:${userByEmail.uid}`
        );
        if (attempt.locked && userByEmail.resetToken) {
          userByEmail.resetToken = null;
          userByEmail.resetTokenExpiresAt = null;
          saveDatabase(db);
        }
      }
      throw new Error(GENERIC_PASSWORD_RESET_ERROR);
    }
  }

  if (!matchedUser || matchedUser.status === 'suspended') {
    throw new Error(GENERIC_PASSWORD_RESET_ERROR);
  }

  const confirmLock = checkBruteForceLockout(
    `reset_confirm:${matchedUser.uid}`
  );
  if (confirmLock.locked) {
    matchedUser.resetToken = null;
    matchedUser.resetTokenExpiresAt = null;
    saveDatabase(db);
    throw new Error(GENERIC_PASSWORD_RESET_ERROR);
  }

  if (
    !matchedUser.resetTokenExpiresAt ||
    new Date(matchedUser.resetTokenExpiresAt).getTime() < Date.now()
  ) {
    matchedUser.resetToken = null;
    matchedUser.resetTokenExpiresAt = null;
    saveDatabase(db);
    throw new Error(GENERIC_PASSWORD_RESET_ERROR);
  }

  matchedUser.passwordHash = hashPasswordScrypt(params.newPassword);
  matchedUser.resetToken = null;
  matchedUser.resetTokenExpiresAt = null;
  matchedUser.updatedAt = new Date().toISOString();

  // Revoke existing sessions on password reset for security
  const nowIso = new Date().toISOString();
  db.sessions.forEach((s) => {
    if (s.userId === matchedUser!.uid && !s.revokedAt) {
      s.revokedAt = nowIso;
    }
  });

  clearFailedLoginAttempts(`login:${matchedUser.email.toLowerCase()}`);
  clearFailedLoginAttempts(`reset_confirm:${matchedUser.uid}`);
  saveDatabase(db);
  return toSafeUser(matchedUser);
}

export function updateUserProfile(
  uid: string,
  patch: {
    displayName?: string;
    photoURL?: string;
    currentPassword?: string;
    newPassword?: string;
  }
): SafeUserProfile {
  const db = loadDatabase();
  const user = db.users.find((u) => u.uid === uid);
  if (!user) {
    throw new Error('User not found.');
  }
  if (user.status === 'suspended') {
    throw new Error('Account is suspended.');
  }
  if (!user.emailVerified && user.provider === 'email') {
    throw new Error(
      'Please verify your email address before modifying account profile or security settings.'
    );
  }

  if (typeof patch.displayName === 'string') {
    const clean = patch.displayName.trim().slice(0, 120);
    if (clean.length < 2) {
      throw new Error('Display name must be at least 2 characters.');
    }
    user.displayName = clean;
  }

  if (typeof patch.photoURL === 'string') {
    const cleanUrl = patch.photoURL.trim().slice(0, 500);
    if (cleanUrl && !/^https?:\/\//i.test(cleanUrl)) {
      throw new Error('Profile picture URL must start with http:// or https://');
    }
    user.photoURL = cleanUrl;
  }

  if (patch.newPassword) {
    if (user.passwordHash) {
      if (!patch.currentPassword || !verifyPasswordScrypt(patch.currentPassword, user.passwordHash)) {
        throw new Error('Current password is incorrect.');
      }
    }
    const pwCheck = validatePasswordStrength(patch.newPassword);
    if (!pwCheck.valid) {
      throw new Error(pwCheck.error || 'Invalid new password.');
    }
    user.passwordHash = hashPasswordScrypt(patch.newPassword);
  }

  user.updatedAt = new Date().toISOString();
  saveDatabase(db);
  return toSafeUser(user);
}

export function exportUserAccountData(uid: string): {
  exportedAt: string;
  platform: string;
  profile: SafeUserProfile;
  activeSessions: UserSessionRecord[];
  pdfJobsHistory: PdfJobRecord[];
  activityEvents: ActivityEventRecord[];
} {
  const db = loadDatabase();
  const user = db.users.find((u) => u.uid === uid);
  if (!user) {
    throw new Error('User account not found.');
  }

  return {
    exportedAt: new Date().toISOString(),
    platform: 'PDFNestly (https://pdfnestly.com)',
    profile: toSafeUser(user),
    activeSessions: db.sessions
      .filter((s) => s.userId === uid)
      .slice(0, 50),
    pdfJobsHistory: db.pdfJobs
      .filter((j) => j.userId === uid)
      .slice(0, 200),
    activityEvents: db.activityEvents
      .filter((e) => e.userId === uid)
      .slice(0, 300),
  };
}

export function deleteOwnUserAccount(uid: string): void {
  const db = loadDatabase();
  const userIndex = db.users.findIndex((u) => u.uid === uid);
  if (userIndex === -1) {
    throw new Error('User account not found.');
  }
  const user = db.users[userIndex];

  // Prevent deleting the sole remaining active administrator
  if (user.role === 'admin') {
    const activeAdmins = db.users.filter(
      (u) => u.role === 'admin' && u.status === 'active'
    );
    if (activeAdmins.length <= 1) {
      throw new Error(
        'Cannot delete the only remaining active administrator account. Promote another administrator first.'
      );
    }
  }

  db.users.splice(userIndex, 1);
  db.sessions = db.sessions.filter((s) => s.userId !== uid);
  db.pdfJobs = db.pdfJobs.filter((j) => j.userId !== uid);
  db.activityEvents = db.activityEvents.filter((e) => e.userId !== uid);
  saveDatabase(db);
}

// ============================================================================
// Activity Tracking & PDF Job History Operations
// ============================================================================

function sanitizeErrorCategory(rawError?: string | null): string | null {
  if (!rawError) return null;
  const clean = String(rawError)
    .replace(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi, '[redacted-email]')
    .slice(0, 120);
  return clean;
}

function recordActivityEventInternal(
  db: PlatformDatabaseShape,
  params: {
    userId: string | null;
    userEmail?: string | null;
    anonymousSessionId: string | null;
    eventType: ActivityEventType;
    toolSlug?: string | null;
    toolName?: string | null;
    pagePath?: string | null;
    status?: 'info' | 'started' | 'succeeded' | 'failed';
    durationMs?: number | null;
    fileSizeBytes?: number | null;
    outputSizeBytes?: number | null;
    errorCategory?: string | null;
    jobId?: string | null;
    dedupeKey?: string | null;
  }
): ActivityEventRecord {
  if (params.dedupeKey) {
    const existing = db.activityEvents.find(
      (e) => e.dedupeKey === params.dedupeKey
    );
    if (existing) {
      return existing;
    }
  }

  const toolDef = params.toolSlug ? getToolBySlug(params.toolSlug) : undefined;
  const nowIso = new Date().toISOString();

  const event: ActivityEventRecord = {
    id: `evt_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`,
    dedupeKey: params.dedupeKey || null,
    userId: params.userId || null,
    userEmail: params.userEmail || null,
    anonymousSessionId: params.anonymousSessionId
      ? String(params.anonymousSessionId).slice(0, 64)
      : null,
    eventType: params.eventType,
    toolSlug: params.toolSlug ? String(params.toolSlug).slice(0, 64) : null,
    toolName:
      params.toolName ||
      toolDef?.shortTitle ||
      (params.toolSlug ? String(params.toolSlug) : null),
    pagePath: params.pagePath ? String(params.pagePath).slice(0, 160) : null,
    status: params.status || 'info',
    durationMs:
      typeof params.durationMs === 'number' && params.durationMs >= 0
        ? Math.round(params.durationMs)
        : null,
    fileSizeBytes:
      typeof params.fileSizeBytes === 'number' && params.fileSizeBytes >= 0
        ? Math.round(params.fileSizeBytes)
        : null,
    outputSizeBytes:
      typeof params.outputSizeBytes === 'number' && params.outputSizeBytes >= 0
        ? Math.round(params.outputSizeBytes)
        : null,
    errorCategory: sanitizeErrorCategory(params.errorCategory),
    jobId: params.jobId ? String(params.jobId).slice(0, 64) : null,
    createdAt: nowIso,
  };

  db.activityEvents.unshift(event);
  if (db.activityEvents.length > 5000) {
    db.activityEvents.length = 5000;
  }

  if (params.userId) {
    const u = db.users.find((usr) => usr.uid === params.userId);
    if (u) {
      u.lastActiveAt = nowIso;
    }
  }

  return event;
}

export function recordActivityAndJobEvent(params: {
  userId: string | null;
  userEmail?: string | null;
  anonymousSessionId: string | null;
  eventType: ActivityEventType;
  toolSlug?: string | null;
  toolName?: string | null;
  pagePath?: string | null;
  status?: 'info' | 'started' | 'succeeded' | 'failed';
  durationMs?: number | null;
  fileSizeBytes?: number | null;
  outputSizeBytes?: number | null;
  errorCategory?: string | null;
  jobId?: string | null;
  dedupeKey?: string | null;
}): { event: ActivityEventRecord; job: PdfJobRecord | null } {
  const db = loadDatabase();
  const toolDef = params.toolSlug ? getToolBySlug(params.toolSlug) : undefined;
  const nowIso = new Date().toISOString();

  let job: PdfJobRecord | null = null;
  const effectiveJobId =
    params.jobId ||
    (params.eventType === 'pdf_processing_started' ||
    params.eventType === 'pdf_processing_completed' ||
    params.eventType === 'pdf_processing_failed'
      ? `job_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`
      : null);

  if (
    effectiveJobId &&
    params.toolSlug &&
    (params.eventType === 'pdf_processing_started' ||
      params.eventType === 'pdf_processing_completed' ||
      params.eventType === 'pdf_processing_failed')
  ) {
    const existingJob = db.pdfJobs.find((j) => j.id === effectiveJobId);
    const jobStatus: 'processing' | 'completed' | 'failed' =
      params.eventType === 'pdf_processing_completed'
        ? 'completed'
        : params.eventType === 'pdf_processing_failed'
        ? 'failed'
        : 'processing';

    if (existingJob) {
      const wasCompleted = existingJob.status === 'completed';
      existingJob.status = jobStatus;
      if (typeof params.fileSizeBytes === 'number' && params.fileSizeBytes > 0) {
        existingJob.fileSizeBytes = Math.round(params.fileSizeBytes);
      }
      if (typeof params.outputSizeBytes === 'number' && params.outputSizeBytes >= 0) {
        existingJob.outputSizeBytes = Math.round(params.outputSizeBytes);
      }
      if (typeof params.durationMs === 'number' && params.durationMs >= 0) {
        existingJob.durationMs = Math.round(params.durationMs);
      }
      if (params.errorCategory) {
        existingJob.errorCategory = sanitizeErrorCategory(params.errorCategory);
      }
      if (jobStatus === 'completed' || jobStatus === 'failed') {
        existingJob.completedAt = nowIso;
      }
      if (!wasCompleted && jobStatus === 'completed' && existingJob.userId) {
        const u = db.users.find((usr) => usr.uid === existingJob.userId);
        if (u) {
          u.pdfJobsCount = (u.pdfJobsCount || 0) + 1;
          u.lastActiveAt = nowIso;
        }
      }
      job = existingJob;
    } else {
      job = {
        id: effectiveJobId,
        userId: params.userId || null,
        userEmail: params.userEmail || null,
        anonymousSessionId: params.anonymousSessionId
          ? String(params.anonymousSessionId).slice(0, 64)
          : null,
        toolSlug: params.toolSlug,
        toolName:
          params.toolName || toolDef?.shortTitle || params.toolSlug,
        category: toolDef?.category || 'PDF Operations',
        processingLocation: toolDef?.processingLocation || 'local-browser',
        status: jobStatus,
        fileSizeBytes: Math.max(0, Math.round(params.fileSizeBytes || 0)),
        outputSizeBytes: Math.max(0, Math.round(params.outputSizeBytes || 0)),
        durationMs: Math.max(0, Math.round(params.durationMs || 0)),
        errorCategory: sanitizeErrorCategory(params.errorCategory),
        createdAt: nowIso,
        completedAt:
          jobStatus === 'completed' || jobStatus === 'failed' ? nowIso : null,
      };
      db.pdfJobs.unshift(job);
      if (db.pdfJobs.length > 3000) {
        db.pdfJobs.length = 3000;
      }
      if (jobStatus === 'completed' && params.userId) {
        const u = db.users.find((usr) => usr.uid === params.userId);
        if (u) {
          u.pdfJobsCount = (u.pdfJobsCount || 0) + 1;
          u.lastActiveAt = nowIso;
        }
      }
    }
  }

  const event = recordActivityEventInternal(db, {
    ...params,
    jobId: effectiveJobId,
  });

  saveDatabase(db);
  return { event, job };
}

export function getUserDashboardData(uid: string): {
  profile: SafeUserProfile;
  recentJobs: PdfJobRecord[];
  recentActivity: ActivityEventRecord[];
  activeSessionsCount: number;
  stats: {
    totalJobs: number;
    completedJobs: number;
    failedJobs: number;
    totalBytesProcessed: number;
    favoriteTool: string | null;
  };
} {
  const db = loadDatabase();
  const user = db.users.find((u) => u.uid === uid);
  if (!user) {
    throw new Error('User not found.');
  }

  const userJobs = db.pdfJobs.filter((j) => j.userId === uid);
  const userEvents = db.activityEvents.filter((e) => e.userId === uid);
  const activeSessions = db.sessions.filter(
    (s) =>
      s.userId === uid &&
      !s.revokedAt &&
      new Date(s.expiresAt).getTime() > Date.now()
  );

  const completedJobs = userJobs.filter((j) => j.status === 'completed');
  const failedJobs = userJobs.filter((j) => j.status === 'failed');
  const totalBytesProcessed = completedJobs.reduce(
    (acc, j) => acc + (j.fileSizeBytes || 0),
    0
  );

  const toolCounts: Record<string, number> = {};
  userJobs.forEach((j) => {
    toolCounts[j.toolName] = (toolCounts[j.toolName] || 0) + 1;
  });
  const favoriteTool =
    Object.entries(toolCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  return {
    profile: toSafeUser(user),
    recentJobs: userJobs.slice(0, 50),
    recentActivity: userEvents.slice(0, 50),
    activeSessionsCount: activeSessions.length,
    stats: {
      totalJobs: userJobs.length,
      completedJobs: completedJobs.length,
      failedJobs: failedJobs.length,
      totalBytesProcessed,
      favoriteTool,
    },
  };
}

// ============================================================================
// Admin Panel Analytics, User Management, Audit Logs & System Settings
// ============================================================================

export function getAdminOverviewMetrics(rangeDays: number = 30) {
  const db = loadDatabase();
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayMs = startOfToday.getTime();
  const last7dMs = now - 7 * dayMs;
  const last30dMs = now - 30 * dayMs;
  const rangeCutoffMs = rangeDays > 0 ? now - rangeDays * dayMs : 0;

  const totalUsers = db.users.length;
  const activeUsersCount = db.users.filter((u) => u.status === 'active').length;
  const suspendedUsersCount = db.users.filter((u) => u.status === 'suspended').length;
  const adminUsersCount = db.users.filter((u) => u.role === 'admin').length;

  const newUsersToday = db.users.filter(
    (u) => new Date(u.createdAt).getTime() >= todayMs
  ).length;
  const newUsers7d = db.users.filter(
    (u) => new Date(u.createdAt).getTime() >= last7dMs
  ).length;
  const newUsers30d = db.users.filter(
    (u) => new Date(u.createdAt).getTime() >= last30dMs
  ).length;

  const googleUsersCount = db.users.filter((u) => u.provider === 'google').length;
  const emailUsersCount = db.users.filter((u) => u.provider === 'email').length;

  // DAU & MAU from real activityEvents + user lastActiveAt
  const dauSet = new Set<string>();
  const mauSet = new Set<string>();

  db.users.forEach((u) => {
    if (u.lastActiveAt) {
      const ts = new Date(u.lastActiveAt).getTime();
      if (ts >= now - dayMs) dauSet.add(u.uid);
      if (ts >= last30dMs) mauSet.add(u.uid);
    }
  });

  db.activityEvents.forEach((e) => {
    const ts = new Date(e.createdAt).getTime();
    const actor = e.userId || e.anonymousSessionId;
    if (actor) {
      if (ts >= now - dayMs) dauSet.add(actor);
      if (ts >= last30dMs) mauSet.add(actor);
    }
  });

  const activeSessionsCount = db.sessions.filter(
    (s) => !s.revokedAt && new Date(s.expiresAt).getTime() > now
  ).length;

  // Filter jobs & events within selected date range
  const jobsInRange = db.pdfJobs.filter(
    (j) => new Date(j.createdAt).getTime() >= rangeCutoffMs
  );
  const eventsInRange = db.activityEvents.filter(
    (e) => new Date(e.createdAt).getTime() >= rangeCutoffMs
  );

  const totalJobs = jobsInRange.length;
  const succeededJobs = jobsInRange.filter((j) => j.status === 'completed').length;
  const failedJobs = jobsInRange.filter((j) => j.status === 'failed').length;
  const processingJobs = jobsInRange.filter((j) => j.status === 'processing').length;
  const totalBytesProcessed = jobsInRange.reduce(
    (acc, j) => acc + (j.fileSizeBytes || 0),
    0
  );

  // Tool usage breakdown across the real 30 PDF tools
  const toolBreakdownMap = new Map<
    string,
    {
      toolSlug: string;
      toolName: string;
      category: string;
      totalJobs: number;
      completedJobs: number;
      failedJobs: number;
      totalBytes: number;
      avgDurationMs: number;
      durationSum: number;
    }
  >();

  jobsInRange.forEach((j) => {
    const existing = toolBreakdownMap.get(j.toolSlug) || {
      toolSlug: j.toolSlug,
      toolName: j.toolName,
      category: j.category,
      totalJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      totalBytes: 0,
      avgDurationMs: 0,
      durationSum: 0,
    };
    existing.totalJobs += 1;
    if (j.status === 'completed') existing.completedJobs += 1;
    if (j.status === 'failed') existing.failedJobs += 1;
    existing.totalBytes += j.fileSizeBytes || 0;
    existing.durationSum += j.durationMs || 0;
    existing.avgDurationMs = Math.round(
      existing.durationSum / Math.max(1, existing.totalJobs)
    );
    toolBreakdownMap.set(j.toolSlug, existing);
  });

  const topTools = Array.from(toolBreakdownMap.values())
    .sort((a, b) => b.totalJobs - a.totalJobs)
    .slice(0, 10);

  // Daily series for last 7 days (User Signups & PDF Jobs)
  const dailySeries: Array<{
    date: string;
    label: string;
    signups: number;
    pdfJobs: number;
    events: number;
  }> = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(now - i * dayMs);
    const dayKey = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    const signups = db.users.filter(
      (u) => u.createdAt.slice(0, 10) === dayKey
    ).length;
    const pdfJobsCount = db.pdfJobs.filter(
      (j) => j.createdAt.slice(0, 10) === dayKey
    ).length;
    const eventsCount = db.activityEvents.filter(
      (e) => e.createdAt.slice(0, 10) === dayKey
    ).length;
    dailySeries.push({
      date: dayKey,
      label,
      signups,
      pdfJobs: pdfJobsCount,
      events: eventsCount,
    });
  }

  const recentErrors = jobsInRange
    .filter((j) => j.status === 'failed')
    .slice(0, 10);

  return {
    users: {
      total: totalUsers,
      active: activeUsersCount,
      suspended: suspendedUsersCount,
      admins: adminUsersCount,
      newToday: newUsersToday,
      new7d: newUsers7d,
      new30d: newUsers30d,
      dau: dauSet.size,
      mau: mauSet.size,
      activeSessions: activeSessionsCount,
      byProvider: {
        google: googleUsersCount,
        email: emailUsersCount,
      },
    },
    jobs: {
      total: totalJobs,
      succeeded: succeededJobs,
      failed: failedJobs,
      processing: processingJobs,
      successRate:
        totalJobs > 0 ? Math.round((succeededJobs / totalJobs) * 100) : 100,
      totalBytesProcessed,
      registeredToolsCount: PDF_TOOLS_REGISTRY.length,
    },
    eventsCountInRange: eventsInRange.length,
    topTools,
    dailySeries,
    recentErrors,
    recentEvents: db.activityEvents.slice(0, 15),
    recentAuditLogs: db.adminAuditLogs.slice(0, 10),
  };
}

export function listAdminUsers(params: {
  search?: string;
  provider?: string;
  status?: string;
  role?: string;
  sortBy?: 'createdAt' | 'lastLoginAt' | 'lastActiveAt' | 'pdfJobsCount';
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}): {
  users: SafeUserProfile[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
} {
  const db = loadDatabase();
  const q = (params.search || '').trim().toLowerCase();

  const filtered = db.users.filter((u) => {
    if (q) {
      const match =
        u.email.toLowerCase().includes(q) ||
        u.displayName.toLowerCase().includes(q) ||
        u.uid.toLowerCase().includes(q);
      if (!match) return false;
    }
    if (params.provider && params.provider !== 'all' && u.provider !== params.provider) {
      return false;
    }
    if (params.status && params.status !== 'all' && u.status !== params.status) {
      return false;
    }
    if (params.role && params.role !== 'all' && u.role !== params.role) {
      return false;
    }
    return true;
  });

  const sortBy = params.sortBy || 'createdAt';
  const dir = params.sortDir === 'asc' ? 1 : -1;

  filtered.sort((a, b) => {
    if (sortBy === 'pdfJobsCount') {
      return ((a.pdfJobsCount || 0) - (b.pdfJobsCount || 0)) * dir;
    }
    const ta = a[sortBy] ? new Date(a[sortBy] as string).getTime() : 0;
    const tb = b[sortBy] ? new Date(b[sortBy] as string).getTime() : 0;
    return (ta - tb) * dir;
  });

  const pageSize = Math.max(1, Math.min(100, params.pageSize || 20));
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.max(1, Math.min(totalPages, params.page || 1));
  const slice = filtered
    .slice((page - 1) * pageSize, page * pageSize)
    .map(toSafeUser);

  return {
    users: slice,
    total,
    page,
    pageSize,
    totalPages,
  };
}

export function getAdminUserDetail(targetUid: string): {
  user: SafeUserProfile;
  sessions: UserSessionRecord[];
  recentJobs: PdfJobRecord[];
  recentEvents: ActivityEventRecord[];
  auditHistory: AdminAuditLogRecord[];
} {
  const db = loadDatabase();
  const user = db.users.find((u) => u.uid === targetUid);
  if (!user) {
    throw new Error('User not found.');
  }

  return {
    user: toSafeUser(user),
    sessions: db.sessions.filter((s) => s.userId === targetUid).slice(0, 25),
    recentJobs: db.pdfJobs.filter((j) => j.userId === targetUid).slice(0, 50),
    recentEvents: db.activityEvents.filter((e) => e.userId === targetUid).slice(0, 50),
    auditHistory: db.adminAuditLogs.filter((l) => l.targetId === targetUid).slice(0, 30),
  };
}

function appendAdminAuditLogInternal(
  db: PlatformDatabaseShape,
  params: {
    adminUid: string;
    adminEmail: string;
    action: string;
    targetType: 'user' | 'session' | 'settings' | 'system';
    targetId: string;
    targetLabel: string;
    summary: string;
    metadata?: Record<string, string | number | boolean | null>;
  }
): AdminAuditLogRecord {
  const log: AdminAuditLogRecord = {
    id: `audit_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`,
    adminUid: params.adminUid,
    adminEmail: params.adminEmail,
    action: params.action,
    targetType: params.targetType,
    targetId: params.targetId,
    targetLabel: params.targetLabel,
    summary: params.summary.slice(0, 500),
    metadata: params.metadata || {},
    createdAt: new Date().toISOString(),
  };
  db.adminAuditLogs.unshift(log);
  if (db.adminAuditLogs.length > 2000) {
    db.adminAuditLogs.length = 2000;
  }
  return log;
}

export function adminUpdateUserStatus(params: {
  adminUid: string;
  adminEmail: string;
  targetUid: string;
  newStatus: AccountStatus;
  reason?: string;
}): { user: SafeUserProfile; auditLog: AdminAuditLogRecord } {
  const db = loadDatabase();
  const target = db.users.find((u) => u.uid === params.targetUid);
  if (!target) {
    throw new Error('Target user not found.');
  }

  if (target.uid === params.adminUid && params.newStatus === 'suspended') {
    throw new Error('You cannot suspend your own administrator account.');
  }

  const prevStatus = target.status;
  target.status = params.newStatus;
  target.updatedAt = new Date().toISOString();

  // If suspending, revoke all active sessions immediately
  if (params.newStatus === 'suspended') {
    const nowIso = new Date().toISOString();
    db.sessions.forEach((s) => {
      if (s.userId === target.uid && !s.revokedAt) {
        s.revokedAt = nowIso;
      }
    });
  }

  const auditLog = appendAdminAuditLogInternal(db, {
    adminUid: params.adminUid,
    adminEmail: params.adminEmail,
    action:
      params.newStatus === 'suspended' ? 'user.suspended' : 'user.reactivated',
    targetType: 'user',
    targetId: target.uid,
    targetLabel: `${target.displayName} (${target.email})`,
    summary: `Changed account status for ${target.email} from "${prevStatus}" to "${params.newStatus}"${
      params.reason ? ` — Reason: ${params.reason}` : ''
    }.`,
    metadata: {
      previousStatus: prevStatus,
      newStatus: params.newStatus,
      reason: params.reason || null,
    },
  });

  saveDatabase(db);
  return { user: toSafeUser(target), auditLog };
}

export function adminUpdateUserRole(params: {
  adminUid: string;
  adminEmail: string;
  targetUid: string;
  newRole: UserRole;
}): { user: SafeUserProfile; auditLog: AdminAuditLogRecord } {
  const db = loadDatabase();
  const target = db.users.find((u) => u.uid === params.targetUid);
  if (!target) {
    throw new Error('Target user not found.');
  }

  if (target.uid === params.adminUid && params.newRole !== 'admin') {
    throw new Error('You cannot demote your own active administrator account.');
  }

  if (target.role === 'admin' && params.newRole !== 'admin') {
    const activeAdmins = db.users.filter(
      (u) => u.role === 'admin' && u.status === 'active'
    );
    if (activeAdmins.length <= 1) {
      throw new Error('Cannot demote the last remaining active administrator.');
    }
  }

  const prevRole = target.role;
  target.role = params.newRole;
  target.updatedAt = new Date().toISOString();

  const auditLog = appendAdminAuditLogInternal(db, {
    adminUid: params.adminUid,
    adminEmail: params.adminEmail,
    action: 'user.role_changed',
    targetType: 'user',
    targetId: target.uid,
    targetLabel: `${target.displayName} (${target.email})`,
    summary: `Changed role for ${target.email} from "${prevRole}" to "${params.newRole}".`,
    metadata: {
      previousRole: prevRole,
      newRole: params.newRole,
    },
  });

  saveDatabase(db);
  return { user: toSafeUser(target), auditLog };
}

export function adminRevokeUserSessions(params: {
  adminUid: string;
  adminEmail: string;
  targetUid: string;
}): { revokedCount: number; auditLog: AdminAuditLogRecord } {
  const db = loadDatabase();
  const target = db.users.find((u) => u.uid === params.targetUid);
  if (!target) {
    throw new Error('Target user not found.');
  }

  const nowIso = new Date().toISOString();
  let revokedCount = 0;
  db.sessions.forEach((s) => {
    if (s.userId === target.uid && !s.revokedAt) {
      s.revokedAt = nowIso;
      revokedCount += 1;
    }
  });

  const auditLog = appendAdminAuditLogInternal(db, {
    adminUid: params.adminUid,
    adminEmail: params.adminEmail,
    action: 'user.sessions_revoked',
    targetType: 'session',
    targetId: target.uid,
    targetLabel: `${target.displayName} (${target.email})`,
    summary: `Force-revoked ${revokedCount} active session(s) for ${target.email}.`,
    metadata: {
      revokedCount,
    },
  });

  saveDatabase(db);
  return { revokedCount, auditLog };
}

export function adminDeleteUser(params: {
  adminUid: string;
  adminEmail: string;
  targetUid: string;
}): { deletedEmail: string; auditLog: AdminAuditLogRecord } {
  const db = loadDatabase();
  const targetIndex = db.users.findIndex((u) => u.uid === params.targetUid);
  if (targetIndex === -1) {
    throw new Error('Target user not found.');
  }

  const target = db.users[targetIndex];
  if (target.uid === params.adminUid) {
    throw new Error('You cannot delete your own active administrator account from the admin console.');
  }

  if (target.role === 'admin') {
    const activeAdmins = db.users.filter(
      (u) => u.role === 'admin' && u.status === 'active'
    );
    if (activeAdmins.length <= 1) {
      throw new Error('Cannot delete the last remaining active administrator.');
    }
  }

  const deletedEmail = target.email;
  const deletedName = target.displayName;
  const deletedUid = target.uid;

  db.users.splice(targetIndex, 1);
  db.sessions = db.sessions.filter((s) => s.userId !== deletedUid);
  db.pdfJobs = db.pdfJobs.filter((j) => j.userId !== deletedUid);
  db.activityEvents = db.activityEvents.filter((e) => e.userId !== deletedUid);

  const auditLog = appendAdminAuditLogInternal(db, {
    adminUid: params.adminUid,
    adminEmail: params.adminEmail,
    action: 'user.deleted',
    targetType: 'user',
    targetId: deletedUid,
    targetLabel: `${deletedName} (${deletedEmail})`,
    summary: `Permanently deleted user account ${deletedEmail} (${deletedUid}) and associated sessions/activity records.`,
    metadata: {
      deletedEmail,
      deletedRole: target.role,
    },
  });

  saveDatabase(db);
  return { deletedEmail, auditLog };
}

export function listAdminActivityEvents(params: {
  eventType?: string;
  toolSlug?: string;
  status?: string;
  search?: string;
  limit?: number;
}): ActivityEventRecord[] {
  const db = loadDatabase();
  const q = (params.search || '').trim().toLowerCase();
  const limit = Math.max(1, Math.min(500, params.limit || 100));

  return db.activityEvents
    .filter((e) => {
      if (params.eventType && params.eventType !== 'all' && e.eventType !== params.eventType) {
        return false;
      }
      if (params.toolSlug && params.toolSlug !== 'all' && e.toolSlug !== params.toolSlug) {
        return false;
      }
      if (params.status && params.status !== 'all' && e.status !== params.status) {
        return false;
      }
      if (q) {
        const match =
          (e.userEmail || '').toLowerCase().includes(q) ||
          (e.userId || '').toLowerCase().includes(q) ||
          (e.anonymousSessionId || '').toLowerCase().includes(q) ||
          (e.toolName || '').toLowerCase().includes(q) ||
          e.eventType.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    })
    .slice(0, limit);
}

export function listAdminPdfJobs(params: {
  toolSlug?: string;
  status?: string;
  search?: string;
  limit?: number;
}): PdfJobRecord[] {
  const db = loadDatabase();
  const q = (params.search || '').trim().toLowerCase();
  const limit = Math.max(1, Math.min(500, params.limit || 100));

  return db.pdfJobs
    .filter((j) => {
      if (params.toolSlug && params.toolSlug !== 'all' && j.toolSlug !== params.toolSlug) {
        return false;
      }
      if (params.status && params.status !== 'all' && j.status !== params.status) {
        return false;
      }
      if (q) {
        const match =
          j.id.toLowerCase().includes(q) ||
          (j.userEmail || '').toLowerCase().includes(q) ||
          (j.userId || '').toLowerCase().includes(q) ||
          j.toolName.toLowerCase().includes(q) ||
          j.toolSlug.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    })
    .slice(0, limit);
}

export function listAdminAuditLogs(limit: number = 100): AdminAuditLogRecord[] {
  const db = loadDatabase();
  return db.adminAuditLogs.slice(0, Math.max(1, Math.min(500, limit)));
}

export function getSystemSettings(): SystemSettingsRecord {
  const db = loadDatabase();
  return db.systemSettings;
}

export function updateSystemSettings(params: {
  adminUid: string;
  adminEmail: string;
  patch: Partial<
    Omit<SystemSettingsRecord, 'updatedBy' | 'updatedAt'>
  >;
}): { settings: SystemSettingsRecord; auditLog: AdminAuditLogRecord } {
  const db = loadDatabase();
  const current = db.systemSettings;
  const p = params.patch;

  if (typeof p.registrationEnabled === 'boolean') {
    current.registrationEnabled = p.registrationEnabled;
  }
  if (typeof p.googleAuthEnabled === 'boolean') {
    current.googleAuthEnabled = p.googleAuthEnabled;
  }
  if (typeof p.emailAuthEnabled === 'boolean') {
    current.emailAuthEnabled = p.emailAuthEnabled;
  }
  if (typeof p.maintenanceMode === 'boolean') {
    current.maintenanceMode = p.maintenanceMode;
  }
  if (typeof p.maintenanceMessage === 'string') {
    current.maintenanceMessage = p.maintenanceMessage.trim().slice(0, 300);
  }
  if (typeof p.rateLimitPerMinute === 'number') {
    current.rateLimitPerMinute = Math.max(10, Math.min(5000, Math.round(p.rateLimitPerMinute)));
  }
  if (typeof p.maxLoginAttempts === 'number') {
    current.maxLoginAttempts = Math.max(3, Math.min(25, Math.round(p.maxLoginAttempts)));
  }
  if (typeof p.lockoutDurationMinutes === 'number') {
    current.lockoutDurationMinutes = Math.max(1, Math.min(1440, Math.round(p.lockoutDurationMinutes)));
  }
  if (typeof p.maxUploadSizeMb === 'number') {
    current.maxUploadSizeMb = Math.max(1, Math.min(500, Math.round(p.maxUploadSizeMb)));
  }
  if (typeof p.activityRetentionDays === 'number') {
    current.activityRetentionDays = Math.max(1, Math.min(3650, Math.round(p.activityRetentionDays)));
  }

  current.updatedBy = params.adminUid;
  current.updatedAt = new Date().toISOString();

  const auditLog = appendAdminAuditLogInternal(db, {
    adminUid: params.adminUid,
    adminEmail: params.adminEmail,
    action: 'settings.updated',
    targetType: 'settings',
    targetId: 'global',
    targetLabel: 'Global Platform Settings',
    summary: `Updated platform configuration (registration=${current.registrationEnabled}, googleAuth=${current.googleAuthEnabled}, emailAuth=${current.emailAuthEnabled}, maintenance=${current.maintenanceMode}, rateLimit=${current.rateLimitPerMinute}/min).`,
    metadata: {
      registrationEnabled: current.registrationEnabled,
      googleAuthEnabled: current.googleAuthEnabled,
      emailAuthEnabled: current.emailAuthEnabled,
      maintenanceMode: current.maintenanceMode,
      rateLimitPerMinute: current.rateLimitPerMinute,
      activityRetentionDays: current.activityRetentionDays,
    },
  });

  saveDatabase(db);
  return { settings: current, auditLog };
}

export function pruneExpiredActivityLogs(params: {
  adminUid: string;
  adminEmail: string;
}): { prunedEvents: number; prunedJobs: number; auditLog: AdminAuditLogRecord } {
  const db = loadDatabase();
  const retentionDays = db.systemSettings.activityRetentionDays || 90;
  const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

  const prevEvents = db.activityEvents.length;
  const prevJobs = db.pdfJobs.length;

  db.activityEvents = db.activityEvents.filter(
    (e) => new Date(e.createdAt).getTime() >= cutoffMs
  );
  db.pdfJobs = db.pdfJobs.filter(
    (j) => new Date(j.createdAt).getTime() >= cutoffMs
  );

  const prunedEvents = prevEvents - db.activityEvents.length;
  const prunedJobs = prevJobs - db.pdfJobs.length;

  const auditLog = appendAdminAuditLogInternal(db, {
    adminUid: params.adminUid,
    adminEmail: params.adminEmail,
    action: 'system.logs_pruned',
    targetType: 'system',
    targetId: 'retention',
    targetLabel: `Retention Policy (${retentionDays}d)`,
    summary: `Pruned ${prunedEvents} expired activity event(s) and ${prunedJobs} expired PDF job record(s) older than ${retentionDays} days.`,
    metadata: {
      retentionDays,
      prunedEvents,
      prunedJobs,
    },
  });

  saveDatabase(db);
  return { prunedEvents, prunedJobs, auditLog };
}

export function recordAdminEmailDiagnosticAuditLog(params: {
  adminUid: string;
  adminEmail: string;
  provider: string | null;
  connectionVerified: boolean;
  messageSubmitted: boolean;
  errorCategory: string;
}): AdminAuditLogRecord {
  const db = loadDatabase();
  const auditLog = appendAdminAuditLogInternal(db, {
    adminUid: params.adminUid,
    adminEmail: params.adminEmail,
    action: 'email.diagnostics_tested',
    targetType: 'system',
    targetId: 'smtp_diagnostics',
    targetLabel: `SMTP Test (${params.adminEmail})`,
    summary: `Executed SMTP diagnostic test to ${params.adminEmail} (provider=${
      params.provider || 'unconfigured'
    }, connectionVerified=${params.connectionVerified}, messageSubmitted=${
      params.messageSubmitted
    }, category=${params.errorCategory}).`,
    metadata: {
      provider: params.provider,
      connectionVerified: params.connectionVerified,
      messageSubmitted: params.messageSubmitted,
      errorCategory: params.errorCategory,
    },
  });
  saveDatabase(db);
  return auditLog;
}

