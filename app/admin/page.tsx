'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Shield,
  Users,
  Activity,
  FileText,
  Settings,
  ClipboardList,
  Search,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Ban,
  UserCheck,
  Trash2,
  KeyRound,
  Eye,
  X,
  Lock,
  BarChart3,
  Server,
  Mail,
  Globe,
  MessageSquare,
} from 'lucide-react';
import { useAuth, ClientUserProfile } from '@/components/AuthProvider';
import { PDF_TOOLS_REGISTRY } from '@/lib/tools-registry';
import { formatFileSize } from '@/lib/pdf-utils';
import {
  AdminSupportTab,
  SupportTicketItem,
  SupportStats,
} from '@/components/admin/AdminSupportTab';
import {
  AdminDemographicsTab,
  DetailedAnalyticsData,
} from '@/components/admin/AdminDemographicsTab';
import { AnalyticsTimeRange } from '@/lib/platform-store';

type AdminTab =
  | 'overview'
  | 'demographics'
  | 'support'
  | 'users'
  | 'activity'
  | 'jobs'
  | 'settings'
  | 'audit';

interface AdminOverviewData {
  users: {
    total: number;
    active: number;
    suspended: number;
    admins: number;
    newToday: number;
    new7d: number;
    new30d: number;
    dau: number;
    mau: number;
    activeSessions: number;
    byProvider: {
      google: number;
      email: number;
    };
  };
  jobs: {
    total: number;
    succeeded: number;
    failed: number;
    processing: number;
    successRate: number;
    totalBytesProcessed: number;
    registeredToolsCount: number;
  };
  eventsCountInRange: number;
  topTools: Array<{
    toolSlug: string;
    toolName: string;
    category: string;
    totalJobs: number;
    completedJobs: number;
    failedJobs: number;
    totalBytes: number;
    avgDurationMs: number;
  }>;
  dailySeries: Array<{
    date: string;
    label: string;
    signups: number;
    pdfJobs: number;
    events: number;
  }>;
  recentErrors: Array<{
    id: string;
    toolName: string;
    errorCategory: string | null;
    createdAt: string;
  }>;
}

interface AdminUserDetailPayload {
  user: ClientUserProfile;
  sessions: Array<{
    id: string;
    provider: string;
    userAgent: string;
    ipHash: string;
    createdAt: string;
    lastSeenAt: string;
    revokedAt: string | null;
  }>;
  recentJobs: Array<{
    id: string;
    toolName: string;
    status: string;
    fileSizeBytes: number;
    durationMs: number;
    createdAt: string;
  }>;
  recentEvents: Array<{
    id: string;
    eventType: string;
    toolName: string | null;
    pagePath: string | null;
    status: string;
    createdAt: string;
  }>;
  auditHistory: Array<{
    id: string;
    action: string;
    adminEmail: string;
    summary: string;
    createdAt: string;
  }>;
}

export default function AdminPlatformPage() {
  const { user, isLoading: authLoading } = useAuth();

  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [rangeDays, setRangeDays] = useState<number>(30);
  const [overview, setOverview] = useState<AdminOverviewData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [accessDenied, setAccessDenied] = useState<boolean>(false);
  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // User Management state
  const [usersList, setUsersList] = useState<ClientUserProfile[]>([]);
  const [usersTotal, setUsersTotal] = useState<number>(0);
  const [userSearch, setUserSearch] = useState<string>('');
  const [userProviderFilter, setUserProviderFilter] = useState<string>('all');
  const [userStatusFilter, setUserStatusFilter] = useState<string>('all');
  const [userRoleFilter, setUserRoleFilter] = useState<string>('all');
  const [userSortBy, setUserSortBy] = useState<string>('createdAt');
  const [selectedUserDetail, setSelectedUserDetail] =
    useState<AdminUserDetailPayload | null>(null);
  const [confirmActionModal, setConfirmActionModal] = useState<{
    type: 'suspend' | 'reactivate' | 'make_admin' | 'make_user' | 'revoke_sessions' | 'delete';
    targetUser: ClientUserProfile;
    reason?: string;
  } | null>(null);

  // Support & Feedback Tickets state
  const [supportTickets, setSupportTickets] = useState<SupportTicketItem[]>([]);
  const [supportStats, setSupportStats] = useState<SupportStats>({
    total: 0,
    open: 0,
    inProgress: 0,
    resolved: 0,
  });
  const [isSupportLoading, setIsSupportLoading] = useState(false);

  // Audience Demographics & Multi-Range Analytics state
  const [analyticsRange, setAnalyticsRange] = useState<AnalyticsTimeRange>('28d');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [detailedAnalytics, setDetailedAnalytics] = useState<DetailedAnalyticsData | null>(null);

  // Activity & PDF Jobs & Audit Logs state
  const [activityEvents, setActivityEvents] = useState<
    Array<{
      id: string;
      userId: string | null;
      userEmail: string | null;
      anonymousSessionId: string | null;
      eventType: string;
      toolSlug: string | null;
      toolName: string | null;
      pagePath: string | null;
      status: string;
      durationMs: number | null;
      fileSizeBytes: number | null;
      jobId: string | null;
      country?: string | null;
      countryCode?: string | null;
      createdAt: string;
    }>
  >([]);
  const [pdfJobs, setPdfJobs] = useState<
    Array<{
      id: string;
      userId: string | null;
      userEmail: string | null;
      anonymousSessionId: string | null;
      toolSlug: string;
      toolName: string;
      category: string;
      processingLocation: string;
      status: string;
      fileSizeBytes: number;
      outputSizeBytes: number;
      durationMs: number;
      errorCategory: string | null;
      createdAt: string;
    }>
  >([]);
  const [auditLogs, setAuditLogs] = useState<
    Array<{
      id: string;
      adminUid: string;
      adminEmail: string;
      action: string;
      targetType: string;
      targetId: string;
      targetLabel: string;
      summary: string;
      createdAt: string;
    }>
  >([]);
  const [eventFilterType, setEventFilterType] = useState<string>('all');
  const [eventFilterTool, setEventFilterTool] = useState<string>('all');
  const [eventFilterStatus, setEventFilterStatus] = useState<string>('all');
  const [eventSearch, setEventSearch] = useState<string>('');

  // System Settings state
  const [settingsForm, setSettingsForm] = useState({
    registrationEnabled: true,
    googleAuthEnabled: true,
    emailAuthEnabled: true,
    maintenanceMode: false,
    maintenanceMessage: '',
    rateLimitPerMinute: 120,
    maxLoginAttempts: 5,
    lockoutDurationMinutes: 15,
    maxUploadSizeMb: 50,
    activityRetentionDays: 90,
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Email & SMTP Diagnostics state
  const [emailDiagConfig, setEmailDiagConfig] = useState<{
    hostPresent: boolean;
    portPresent: boolean;
    userPresent: boolean;
    passwordPresent: boolean;
    fromPresent: boolean;
    allRequiredPresent: boolean;
    configuredHost: string | null;
    configuredPort: number | null;
    configuredFromAddress: string | null;
    activeProvider: string | null;
  } | null>(null);
  const [emailDiagResult, setEmailDiagResult] = useState<{
    connectionVerified: boolean;
    messageSubmitted?: boolean;
    messageId?: string | null;
    errorCategory: string;
    sanitizedMessage: string;
    recipient?: string;
    deliveryDistinctionNote?: string;
  } | null>(null);
  const [isCheckingSmtp, setIsCheckingSmtp] = useState(false);
  const [isSendingTestEmail, setIsSendingTestEmail] = useState(false);

  const fetchOverviewAndSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        range: analyticsRange,
      });
      if (analyticsRange === 'custom' && customStartDate && customEndDate) {
        params.set('startDate', customStartDate);
        params.set('endDate', customEndDate);
      } else {
        params.set('rangeDays', String(rangeDays));
      }

      const res = await fetch(`/api/admin/overview?${params.toString()}`, {
        cache: 'no-store',
      });
      if (res.status === 401 || res.status === 403) {
        setAccessDenied(true);
        setIsLoading(false);
        return;
      }
      const data = await res.json();
      if (res.ok) {
        setAccessDenied(false);
        if (data.overview) setOverview(data.overview);
        if (data.analytics) setDetailedAnalytics(data.analytics);
        if (data.settings) {
          setSettingsForm({
            registrationEnabled: data.settings.registrationEnabled,
            googleAuthEnabled: data.settings.googleAuthEnabled,
            emailAuthEnabled: data.settings.emailAuthEnabled,
            maintenanceMode: data.settings.maintenanceMode,
            maintenanceMessage: data.settings.maintenanceMessage,
            rateLimitPerMinute: data.settings.rateLimitPerMinute,
            maxLoginAttempts: data.settings.maxLoginAttempts,
            lockoutDurationMinutes: data.settings.lockoutDurationMinutes,
            maxUploadSizeMb: data.settings.maxUploadSizeMb,
            activityRetentionDays: data.settings.activityRetentionDays,
          });
        }
      }
    } catch {
      // Ignore network errors
    } finally {
      setIsLoading(false);
    }
  }, [rangeDays, analyticsRange, customStartDate, customEndDate]);

  const fetchSupportTickets = useCallback(async () => {
    setIsSupportLoading(true);
    try {
      const res = await fetch('/api/admin/support?status=all', {
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        setSupportTickets(data.tickets || []);
        if (data.stats) setSupportStats(data.stats);
      }
    } catch {
      // Ignore network errors
    } finally {
      setIsSupportLoading(false);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    const params = new URLSearchParams({
      search: userSearch,
      provider: userProviderFilter,
      status: userStatusFilter,
      role: userRoleFilter,
      sortBy: userSortBy,
      sortDir: 'desc',
      pageSize: '50',
    });
    const res = await fetch(`/api/admin/users?${params.toString()}`, {
      cache: 'no-store',
    });
    if (res.ok) {
      const data = await res.json();
      setUsersList(data.users || []);
      setUsersTotal(data.total || 0);
    }
  }, [
    userSearch,
    userProviderFilter,
    userStatusFilter,
    userRoleFilter,
    userSortBy,
  ]);

  const fetchEventsAndJobs = useCallback(async () => {
    const params = new URLSearchParams({
      eventType: eventFilterType,
      toolSlug: eventFilterTool,
      status: eventFilterStatus,
      search: eventSearch,
      limit: '150',
    });
    const res = await fetch(`/api/admin/events?${params.toString()}`, {
      cache: 'no-store',
    });
    if (res.ok) {
      const data = await res.json();
      setActivityEvents(data.events || []);
      setPdfJobs(data.jobs || []);
      setAuditLogs(data.auditLogs || []);
    }
  }, [eventFilterType, eventFilterTool, eventFilterStatus, eventSearch]);

  const fetchEmailDiagnostics = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/email-diagnostics', {
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.configStatus) {
          setEmailDiagConfig(data.configStatus);
        }
      }
    } catch {
      // Ignore network errors
    }
  }, []);

  const handleVerifySmtpConnection = async () => {
    setIsCheckingSmtp(true);
    setEmailDiagResult(null);
    try {
      const res = await fetch(
        '/api/admin/email-diagnostics?verifyConnection=true',
        { cache: 'no-store' }
      );
      const data = await res.json();
      if (!res.ok) {
        setEmailDiagResult({
          connectionVerified: false,
          errorCategory: 'rate_limited',
          sanitizedMessage:
            data.error || 'Unable to verify SMTP connection right now.',
        });
        return;
      }
      if (data.configStatus) {
        setEmailDiagConfig(data.configStatus);
      }
      if (data.connectionCheck) {
        setEmailDiagResult({
          connectionVerified: data.connectionCheck.verified,
          errorCategory: data.connectionCheck.errorCategory,
          sanitizedMessage: data.connectionCheck.sanitizedMessage,
        });
      }
    } catch {
      setEmailDiagResult({
        connectionVerified: false,
        errorCategory: 'smtp_error',
        sanitizedMessage: 'Failed to reach SMTP diagnostics endpoint.',
      });
    } finally {
      setIsCheckingSmtp(false);
    }
  };

  const handleSendAdminTestEmail = async () => {
    setIsSendingTestEmail(true);
    setEmailDiagResult(null);
    try {
      const res = await fetch('/api/admin/email-diagnostics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.status === 429 || res.status === 400) {
        setEmailDiagResult({
          connectionVerified: false,
          messageSubmitted: false,
          errorCategory: 'rate_limited',
          sanitizedMessage: data.error || 'Diagnostic test email rejected.',
        });
        return;
      }
      if (data.configStatus) {
        setEmailDiagConfig(data.configStatus);
      }
      setEmailDiagResult({
        connectionVerified: Boolean(data.connectionVerified),
        messageSubmitted: Boolean(data.messageSubmitted),
        messageId: data.messageId || null,
        errorCategory: data.errorCategory || 'smtp_error',
        sanitizedMessage:
          data.sanitizedMessage || 'Diagnostic test completed.',
        recipient: data.recipient,
        deliveryDistinctionNote: data.deliveryDistinctionNote,
      });
      await fetchEventsAndJobs();
    } catch {
      setEmailDiagResult({
        connectionVerified: false,
        messageSubmitted: false,
        errorCategory: 'smtp_error',
        sanitizedMessage: 'Failed to execute SMTP test email request.',
      });
    } finally {
      setIsSendingTestEmail(false);
    }
  };

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        setIsLoading(false);
      } else if (user.role !== 'admin') {
        setAccessDenied(true);
        setIsLoading(false);
      } else {
        fetchOverviewAndSettings();
        fetchUsers();
        fetchEventsAndJobs();
        fetchEmailDiagnostics();
        fetchSupportTickets();
      }
    }
  }, [
    authLoading,
    user,
    fetchOverviewAndSettings,
    fetchUsers,
    fetchEventsAndJobs,
    fetchEmailDiagnostics,
    fetchSupportTickets,
  ]);

  const handleOpenUserDetail = async (uid: string) => {
    const res = await fetch(
      `/api/admin/users?uid=${encodeURIComponent(uid)}`,
      { cache: 'no-store' }
    );
    if (res.ok) {
      const detail = await res.json();
      setSelectedUserDetail(detail);
    }
  };

  const handleExecuteConfirmedUserAction = async () => {
    if (!confirmActionModal) return;
    const { type, targetUser, reason } = confirmActionModal;
    setStatusBanner(null);

    try {
      let res: Response;
      if (type === 'delete') {
        res = await fetch('/api/admin/users', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetUid: targetUser.uid }),
        });
      } else if (type === 'suspend' || type === 'reactivate') {
        res = await fetch('/api/admin/users', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: type,
            targetUid: targetUser.uid,
            reason,
          }),
        });
      } else if (type === 'make_admin' || type === 'make_user') {
        res = await fetch('/api/admin/users', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'change_role',
            targetUid: targetUser.uid,
            newRole: type === 'make_admin' ? 'admin' : 'user',
          }),
        });
      } else {
        res = await fetch('/api/admin/users', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'revoke_sessions',
            targetUid: targetUser.uid,
          }),
        });
      }

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Action failed.');
      }

      setStatusBanner({
        type: 'success',
        text: data.message || 'Action completed and recorded in audit log.',
      });
      setConfirmActionModal(null);

      await Promise.all([
        fetchOverviewAndSettings(),
        fetchUsers(),
        fetchEventsAndJobs(),
      ]);

      if (selectedUserDetail && selectedUserDetail.user.uid === targetUser.uid) {
        if (type === 'delete') {
          setSelectedUserDetail(null);
        } else {
          await handleOpenUserDetail(targetUser.uid);
        }
      }
    } catch (err) {
      setStatusBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Admin operation failed.',
      });
      setConfirmActionModal(null);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSettings(true);
    setStatusBanner(null);

    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsForm),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update settings.');
      }
      setStatusBanner({
        type: 'success',
        text: data.message || 'System settings updated.',
      });
      await fetchEventsAndJobs();
    } catch (err) {
      setStatusBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Settings update failed.',
      });
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handlePruneExpiredLogs = async () => {
    setStatusBanner(null);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'prune_logs' }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Unable to prune logs.');
      }
      setStatusBanner({
        type: 'success',
        text: data.message,
      });
      await Promise.all([fetchOverviewAndSettings(), fetchEventsAndJobs()]);
    } catch (err) {
      setStatusBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Log pruning failed.',
      });
    }
  };

  // Loading authentication state
  if (authLoading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-6 py-12 bg-[#FAFAFA] dark:bg-[#09090B]">
        <div className="flex items-center gap-3 text-xs font-semibold text-[#52525B] dark:text-[#D4D4D8]">
          <RefreshCw className="w-5 h-5 animate-spin text-[#B91C1C]" />
          <span>Verifying administrator authentication...</span>
        </div>
      </div>
    );
  }

  // Unauthenticated state
  if (!user) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-6 py-12 bg-[#FAFAFA] dark:bg-[#09090B]">
        <div className="max-w-md w-full bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl p-8 text-center space-y-4 shadow-sm">
          <Lock className="w-10 h-10 text-[#B91C1C] mx-auto" />
          <h1 className="text-xl font-bold text-[#18181B] dark:text-[#FAFAFA]">
            Administrator Authentication Required
          </h1>
          <p className="text-xs text-[#52525B] dark:text-[#D4D4D8] leading-relaxed">
            Please sign in with an authorized PDFNestly administrator account to
            access the Admin Platform.
          </p>
          <div className="pt-2">
            <Link
              href="/login?redirect=/admin"
              className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-[#B91C1C] hover:bg-[#7F1D1D] text-white text-xs font-semibold transition-colors"
            >
              Sign In to Admin Console
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Non-admin 403 Forbidden state
  if (!authLoading && (accessDenied || (user && user.role !== 'admin'))) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-6 py-12 bg-[#FAFAFA] dark:bg-[#09090B]">
        <div className="max-w-md w-full bg-white dark:bg-[#18181B] border border-[#D64545]/40 rounded-2xl p-8 text-center space-y-4 shadow-sm">
          <Shield className="w-12 h-12 text-[#D64545] mx-auto" />
          <h1 className="text-xl font-bold text-[#18181B] dark:text-[#FAFAFA]">
            403 Access Denied — Administrator Privileges Required
          </h1>
          <p className="text-xs text-[#52525B] dark:text-[#D4D4D8] leading-relaxed">
            Your account (<strong>{user?.email}</strong>) has standard user
            permissions (<code className="font-mono">role: user</code>). Access
            to the PDFNestly Admin Console is strictly restricted to verified
            platform administrators.
          </p>
          <div className="pt-2 flex items-center justify-center gap-3">
            <Link
              href="/dashboard"
              className="px-4 py-2 rounded-xl bg-[#B91C1C] text-white text-xs font-semibold hover:bg-[#7F1D1D]"
            >
              Go to User Dashboard
            </Link>
            <Link
              href="/tools"
              className="px-4 py-2 rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] text-xs font-semibold"
            >
              Browse PDF Tools
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#FAFAFA] dark:bg-[#09090B] min-h-[calc(100vh-4rem)] py-8 px-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Top Admin Header Bar */}
        <div className="bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl p-6 shadow-2xs flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-[#FEF2F2] dark:bg-[#B91C1C]/20 text-[#B91C1C] dark:text-[#EF4444]">
                <Shield className="w-4 h-4" />
              </span>
              <h1 className="text-2xl font-bold text-[#18181B] dark:text-[#FAFAFA] tracking-tight">
                PDFNestly Admin Platform
              </h1>
              <span className="px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider rounded-md bg-[#16865B]/10 text-[#16865B] dark:text-[#34D399]">
                Live Database
              </span>
            </div>
            <p className="text-xs text-[#52525B] dark:text-[#A1A1AA]">
              Signed in as administrator <strong>{user?.email}</strong> ·
              Real-time user management, PDF tool telemetry, security settings,
              and immutable audit logs.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <select
              aria-label="Analytics time range"
              value={rangeDays}
              onChange={(e) => setRangeDays(Number(e.target.value))}
              className="px-3 py-2 text-xs font-semibold rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] bg-[#FAFAFA] dark:bg-[#27272A] text-[#18181B] dark:text-[#FAFAFA]"
            >
              <option value={1}>Today (24h)</option>
              <option value={7}>Last 7 Days</option>
              <option value={30}>Last 30 Days</option>
              <option value={365}>Last 12 Months</option>
            </select>

            <button
              type="button"
              onClick={() => {
                fetchOverviewAndSettings();
                fetchUsers();
                fetchEventsAndJobs();
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] bg-[#FAFAFA] dark:bg-[#27272A] hover:border-[#B91C1C] text-xs font-semibold cursor-pointer"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#B91C1C]' : ''}`}
              />
              <span>Refresh Data</span>
            </button>

            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#18181B] dark:bg-[#FAFAFA] text-white dark:text-[#18181B] text-xs font-semibold"
            >
              <span>My Account</span>
            </Link>
          </div>
        </div>

        {statusBanner && (
          <div
            role="status"
            className={`p-4 rounded-xl border text-xs font-medium flex items-center justify-between gap-4 ${
              statusBanner.type === 'success'
                ? 'bg-[#16865B]/10 border-[#16865B]/30 text-[#16865B] dark:text-[#34D399]'
                : 'bg-[#D64545]/10 border-[#D64545]/30 text-[#D64545] dark:text-[#F87171]'
            }`}
          >
            <div className="flex items-center gap-2">
              {statusBanner.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{statusBanner.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusBanner(null)}
              aria-label="Dismiss notification"
              className="text-xs underline cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Section Navigation Bar */}
        <div
          role="tablist"
          aria-label="Admin sections"
          className="bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl p-1.5 flex flex-wrap items-center gap-1.5 shadow-2xs"
        >
          {[
            { id: 'overview', label: 'Overview & Analytics', icon: BarChart3 },
            { id: 'demographics', label: 'Audience Demographics', icon: Globe },
            {
              id: 'support',
              label: `Support & Inquiries (${supportStats.open > 0 ? `${supportStats.open} Open` : supportStats.total})`,
              icon: MessageSquare,
            },
            {
              id: 'users',
              label: `User Management (${overview?.users.total ?? usersTotal})`,
              icon: Users,
            },
            {
              id: 'activity',
              label: `User Activity (${activityEvents.length})`,
              icon: Activity,
            },
            {
              id: 'jobs',
              label: `PDF Jobs History (${pdfJobs.length})`,
              icon: FileText,
            },
            {
              id: 'audit',
              label: `Audit Logs (${auditLogs.length})`,
              icon: ClipboardList,
            },
            {
              id: 'settings',
              label: 'Admin Settings & Health',
              icon: Settings,
            },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(tab.id as AdminTab)}
                className={`px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#B91C1C] text-white shadow-xs'
                    : 'text-[#52525B] dark:text-[#D4D4D8] hover:bg-[#F4F4F5] dark:hover:bg-[#27272A]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* TAB 1: OVERVIEW DASHBOARD */}
        {activeTab === 'overview' && !overview && isLoading && (
          <div className="bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl p-12 flex items-center justify-center gap-3 text-sm text-[#52525B] dark:text-[#D4D4D8]">
            <RefreshCw className="w-4 h-4 animate-spin text-[#B91C1C]" />
            <span>Loading real-time platform analytics & metrics...</span>
          </div>
        )}
        {activeTab === 'overview' && overview && (
          <div className="space-y-6">
            {/* Primary KPI Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-5 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl space-y-1.5">
                <div className="text-xs font-medium text-[#71717A] flex items-center justify-between">
                  <span>Total Registered Users</span>
                  <Users className="w-4 h-4 text-[#B91C1C]" />
                </div>
                <div className="text-2xl font-bold text-[#18181B] dark:text-[#FAFAFA] font-mono">
                  {overview.users.total}
                </div>
                <div className="text-[11px] text-[#52525B] dark:text-[#A1A1AA]">
                  +{overview.users.newToday} today · +{overview.users.new7d} (7d)
                  · +{overview.users.new30d} (30d)
                </div>
              </div>

              <div className="p-5 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl space-y-1.5">
                <div className="text-xs font-medium text-[#71717A] flex items-center justify-between">
                  <span>Active Users (DAU / MAU)</span>
                  <Activity className="w-4 h-4 text-[#16865B]" />
                </div>
                <div className="text-2xl font-bold text-[#18181B] dark:text-[#FAFAFA] font-mono">
                  {overview.users.dau} / {overview.users.mau}
                </div>
                <div className="text-[11px] text-[#52525B] dark:text-[#A1A1AA]">
                  {overview.users.activeSessions} active session(s) ·{' '}
                  {overview.eventsCountInRange} events
                </div>
              </div>

              <div className="p-5 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl space-y-1.5">
                <div className="text-xs font-medium text-[#71717A] flex items-center justify-between">
                  <span>Auth Providers Breakdown</span>
                  <KeyRound className="w-4 h-4 text-[#B91C1C]" />
                </div>
                <div className="text-2xl font-bold text-[#18181B] dark:text-[#FAFAFA] font-mono">
                  {overview.users.byProvider.google} Google /{' '}
                  {overview.users.byProvider.email} Email
                </div>
                <div className="text-[11px] text-[#52525B] dark:text-[#A1A1AA]">
                  {overview.users.active} active · {overview.users.suspended}{' '}
                  suspended · {overview.users.admins} admin(s)
                </div>
              </div>

              <div className="p-5 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl space-y-1.5">
                <div className="text-xs font-medium text-[#71717A] flex items-center justify-between">
                  <span>PDF Processing Jobs</span>
                  <FileText className="w-4 h-4 text-[#16865B]" />
                </div>
                <div className="text-2xl font-bold text-[#18181B] dark:text-[#FAFAFA] font-mono">
                  {overview.jobs.total} ({overview.jobs.successRate}%)
                </div>
                <div className="text-[11px] text-[#52525B] dark:text-[#A1A1AA]">
                  {overview.jobs.succeeded} succeeded · {overview.jobs.failed}{' '}
                  failed · {formatFileSize(overview.jobs.totalBytesProcessed)}
                </div>
              </div>
            </div>

            {/* Charts & Top PDF Tools Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* 7-Day Activity & PDF Jobs Chart */}
              <div className="lg:col-span-6 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-bold text-[#18181B] dark:text-[#FAFAFA]">
                      7-Day User Signups, PDF Jobs & Events
                    </h2>
                    <p className="text-xs text-[#71717A]">
                      Real daily telemetry aggregated from platform database
                    </p>
                  </div>
                </div>

                <div className="pt-2 space-y-3">
                  {overview.dailySeries.map((day) => {
                    const maxVal = Math.max(
                      1,
                      ...overview.dailySeries.map((d) =>
                        Math.max(d.events, d.pdfJobs, d.signups)
                      )
                    );
                    const eventWidth = Math.round((day.events / maxVal) * 100);
                    const jobWidth = Math.round((day.pdfJobs / maxVal) * 100);
                    return (
                      <div key={day.date} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-mono font-medium text-[#18181B] dark:text-[#FAFAFA]">
                            {day.label}
                          </span>
                          <span className="font-mono text-[11px] text-[#71717A]">
                            {day.signups} signups · {day.pdfJobs} jobs ·{' '}
                            {day.events} events
                          </span>
                        </div>
                        <div className="h-2.5 w-full bg-[#F4F4F5] dark:bg-[#27272A] rounded-full overflow-hidden flex gap-0.5">
                          <div
                            style={{ width: `${Math.max(2, jobWidth)}%` }}
                            className="bg-[#B91C1C] h-full rounded-l-full"
                            title={`${day.pdfJobs} PDF jobs`}
                          />
                          <div
                            style={{
                              width: `${Math.max(
                                2,
                                Math.max(0, eventWidth - jobWidth)
                              )}%`,
                            }}
                            className="bg-[#16865B] h-full rounded-r-full"
                            title={`${day.events} total events`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Most-Used PDF Tools Ranking */}
              <div className="lg:col-span-6 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-bold text-[#18181B] dark:text-[#FAFAFA]">
                      Most-Used PDF Tools
                    </h2>
                    <p className="text-xs text-[#71717A]">
                      Across all {overview.jobs.registeredToolsCount} active
                      PDFNestly tools
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('jobs')}
                    className="text-xs font-semibold text-[#B91C1C] hover:underline cursor-pointer"
                  >
                    View All Jobs →
                  </button>
                </div>

                {!overview.topTools.length ? (
                  <div className="py-10 text-center text-xs text-[#71717A]">
                    No PDF tool jobs executed in this period yet. Run any PDF
                    tool to populate live usage metrics.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-[#E4E4E7] dark:border-[#3F3F46] text-[11px] text-[#71717A] uppercase">
                          <th className="py-2 pr-3">Tool</th>
                          <th className="py-2 px-3">Jobs</th>
                          <th className="py-2 px-3">Success</th>
                          <th className="py-2 px-3">Volume</th>
                          <th className="py-2 pl-3 text-right">Avg Time</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E4E4E7] dark:divide-[#3F3F46]">
                        {overview.topTools.map((t) => (
                          <tr key={t.toolSlug}>
                            <td className="py-2.5 pr-3 font-semibold text-[#18181B] dark:text-[#FAFAFA]">
                              {t.toolName}
                              <span className="block text-[10px] font-normal text-[#71717A]">
                                /{t.toolSlug}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold">
                              {t.totalJobs}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[#16865B]">
                              {t.completedJobs}/{t.totalJobs}
                            </td>
                            <td className="py-2.5 px-3 font-mono">
                              {formatFileSize(t.totalBytes)}
                            </td>
                            <td className="py-2.5 pl-3 font-mono text-right">
                              {t.avgDurationMs} ms
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* AUDIENCE DEMOGRAPHICS TAB */}
        {activeTab === 'demographics' && (
          <AdminDemographicsTab
            analytics={detailedAnalytics}
            selectedRange={analyticsRange}
            onRangeChange={(r) => {
              setAnalyticsRange(r);
              if (r !== 'custom') {
                const days = r === 'today' ? 1 : r === '7d' ? 7 : r === '28d' ? 28 : r === '90d' ? 90 : 365;
                setRangeDays(days);
              }
            }}
            customStartDate={customStartDate}
            customEndDate={customEndDate}
            onCustomDateChange={(s, e) => {
              setCustomStartDate(s);
              setCustomEndDate(e);
            }}
            isLoading={isLoading}
            onRefresh={fetchOverviewAndSettings}
          />
        )}

        {/* SUPPORT & FEEDBACK TICKETS TAB */}
        {activeTab === 'support' && (
          <AdminSupportTab
            tickets={supportTickets}
            stats={supportStats}
            isLoading={isSupportLoading}
            onRefresh={fetchSupportTickets}
            onReplySuccess={(msg) => {
              setStatusBanner({ type: 'success', text: msg });
            }}
            onError={(err) => {
              setStatusBanner({ type: 'error', text: err });
            }}
          />
        )}

        {/* TAB 2: USER MANAGEMENT */}
        {activeTab === 'users' && (
          <div className="bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl p-6 space-y-5 shadow-2xs">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-[#18181B] dark:text-[#FAFAFA]">
                  Registered Users ({usersTotal})
                </h2>
                <p className="text-xs text-[#71717A]">
                  Search, inspect, suspend/reactivate, change roles, revoke
                  sessions, or remove accounts with full audit logging.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-[#71717A] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="search"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Search name, email, or UID..."
                    aria-label="Search users"
                    className="pl-8 pr-3 py-1.5 text-xs rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] bg-[#FAFAFA] dark:bg-[#27272A] w-56"
                  />
                </div>

                <select
                  aria-label="Filter by provider"
                  value={userProviderFilter}
                  onChange={(e) => setUserProviderFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] bg-[#FAFAFA] dark:bg-[#27272A]"
                >
                  <option value="all">All Providers</option>
                  <option value="google">Google OAuth</option>
                  <option value="email">Email & Password</option>
                </select>

                <select
                  aria-label="Filter by account status"
                  value={userStatusFilter}
                  onChange={(e) => setUserStatusFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] bg-[#FAFAFA] dark:bg-[#27272A]"
                >
                  <option value="all">All Statuses</option>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                </select>

                <select
                  aria-label="Filter by role"
                  value={userRoleFilter}
                  onChange={(e) => setUserRoleFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] bg-[#FAFAFA] dark:bg-[#27272A]"
                >
                  <option value="all">All Roles</option>
                  <option value="admin">Admins</option>
                  <option value="user">Users</option>
                </select>

                <select
                  aria-label="Sort users by"
                  value={userSortBy}
                  onChange={(e) => setUserSortBy(e.target.value)}
                  className="px-2.5 py-1.5 text-xs rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] bg-[#FAFAFA] dark:bg-[#27272A]"
                >
                  <option value="createdAt">Sort: Newest Joined</option>
                  <option value="lastActiveAt">Sort: Recently Active</option>
                  <option value="lastLoginAt">Sort: Last Login</option>
                  <option value="pdfJobsCount">Sort: Most PDF Jobs</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#E4E4E7] dark:border-[#3F3F46] text-[11px] text-[#71717A] uppercase tracking-wider">
                    <th className="py-3 px-3">User</th>
                    <th className="py-3 px-3">Provider</th>
                    <th className="py-3 px-3">Role</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3">PDF Jobs</th>
                    <th className="py-3 px-3">Joined / Last Active</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4E4E7] dark:divide-[#3F3F46]">
                  {usersList.map((u) => (
                    <tr
                      key={u.uid}
                      className="hover:bg-[#FAFAFA] dark:hover:bg-[#27272A]/60"
                    >
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-[#FEF2F2] dark:bg-[#B91C1C]/20 text-[#B91C1C] font-bold flex items-center justify-center text-xs shrink-0">
                            {u.displayName.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-[#18181B] dark:text-[#FAFAFA]">
                              {u.displayName}
                            </div>
                            <div className="text-[11px] text-[#71717A]">
                              {u.email} ·{' '}
                              <span className="font-mono text-[10px]">
                                {u.uid}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded-md bg-[#F4F4F5] dark:bg-[#27272A] font-medium capitalize">
                          {u.provider}
                        </span>
                      </td>

                      <td className="py-3 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-md font-bold text-[11px] uppercase ${
                            u.role === 'admin'
                              ? 'bg-[#FEF2F2] dark:bg-[#B91C1C]/20 text-[#B91C1C] dark:text-[#EF4444]'
                              : 'bg-[#F4F4F5] dark:bg-[#27272A] text-[#52525B] dark:text-[#D4D4D8]'
                          }`}
                        >
                          {u.role}
                        </span>
                      </td>

                      <td className="py-3 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-md font-semibold text-[11px] capitalize ${
                            u.status === 'active'
                              ? 'bg-[#16865B]/10 text-[#16865B] dark:text-[#34D399]'
                              : 'bg-[#D64545]/10 text-[#D64545] dark:text-[#F87171]'
                          }`}
                        >
                          {u.status}
                        </span>
                      </td>

                      <td className="py-3 px-3 font-mono font-bold">
                        {u.pdfJobsCount || 0}
                      </td>

                      <td className="py-3 px-3 text-[11px] text-[#71717A]">
                        <div>
                          Joined: {new Date(u.createdAt).toLocaleDateString()}
                        </div>
                        <div>
                          Active:{' '}
                          {u.lastActiveAt
                            ? new Date(u.lastActiveAt).toLocaleString()
                            : 'Never'}
                        </div>
                      </td>

                      <td className="py-3 px-3 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenUserDetail(u.uid)}
                            title="Inspect User Details"
                            className="px-2.5 py-1 rounded-lg border border-[#E4E4E7] dark:border-[#3F3F46] hover:border-[#B91C1C] text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Inspect</span>
                          </button>

                          {u.uid !== user?.uid && (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  setConfirmActionModal({
                                    type:
                                      u.status === 'active'
                                        ? 'suspend'
                                        : 'reactivate',
                                    targetUser: u,
                                  })
                                }
                                title={
                                  u.status === 'active'
                                    ? 'Suspend User'
                                    : 'Reactivate User'
                                }
                                className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                                  u.status === 'active'
                                    ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                    : 'bg-[#16865B]/15 text-[#16865B] dark:text-[#34D399]'
                                }`}
                              >
                                {u.status === 'active' ? 'Suspend' : 'Activate'}
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  setConfirmActionModal({
                                    type:
                                      u.role === 'admin'
                                        ? 'make_user'
                                        : 'make_admin',
                                    targetUser: u,
                                  })
                                }
                                className="px-2.5 py-1 rounded-lg border border-[#E4E4E7] dark:border-[#3F3F46] text-xs font-semibold cursor-pointer"
                              >
                                {u.role === 'admin'
                                  ? 'Demote'
                                  : 'Make Admin'}
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  setConfirmActionModal({
                                    type: 'delete',
                                    targetUser: u,
                                  })
                                }
                                aria-label={`Delete ${u.email}`}
                                className="p-1.5 rounded-lg text-[#D64545] hover:bg-[#D64545]/10 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: USER ACTIVITY EVENTS */}
        {activeTab === 'activity' && (
          <div className="bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl p-6 space-y-5 shadow-2xs">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-[#18181B] dark:text-[#FAFAFA]">
                  Real-Time User & Tool Activity Log ({activityEvents.length})
                </h2>
                <p className="text-xs text-[#71717A]">
                  Tracks signups, logins, logouts, page views, tool opens, PDF
                  uploads, processing completions/failures, and downloads.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="search"
                  value={eventSearch}
                  onChange={(e) => setEventSearch(e.target.value)}
                  placeholder="Search user, session, or tool..."
                  aria-label="Search activity events"
                  className="px-3 py-1.5 text-xs rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] bg-[#FAFAFA] dark:bg-[#27272A]"
                />

                <select
                  aria-label="Filter by event type"
                  value={eventFilterType}
                  onChange={(e) => setEventFilterType(e.target.value)}
                  className="px-2.5 py-1.5 text-xs rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] bg-[#FAFAFA] dark:bg-[#27272A]"
                >
                  <option value="all">All Event Types</option>
                  <option value="signup_completed">signup_completed</option>
                  <option value="login_completed">login_completed</option>
                  <option value="logout_completed">logout_completed</option>
                  <option value="page_viewed">page_viewed</option>
                  <option value="tool_opened">tool_opened</option>
                  <option value="pdf_upload_started">pdf_upload_started</option>
                  <option value="pdf_processing_started">
                    pdf_processing_started
                  </option>
                  <option value="pdf_processing_completed">
                    pdf_processing_completed
                  </option>
                  <option value="pdf_processing_failed">
                    pdf_processing_failed
                  </option>
                  <option value="pdf_download_completed">
                    pdf_download_completed
                  </option>
                </select>

                <select
                  aria-label="Filter by PDF tool"
                  value={eventFilterTool}
                  onChange={(e) => setEventFilterTool(e.target.value)}
                  className="px-2.5 py-1.5 text-xs rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] bg-[#FAFAFA] dark:bg-[#27272A]"
                >
                  <option value="all">All 30 PDF Tools</option>
                  {PDF_TOOLS_REGISTRY.map((t) => (
                    <option key={t.slug} value={t.slug}>
                      {t.shortTitle}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#E4E4E7] dark:border-[#3F3F46] text-[11px] text-[#71717A] uppercase">
                    <th className="py-2.5 px-3">Event Type</th>
                    <th className="py-2.5 px-3">User / Session</th>
                    <th className="py-2.5 px-3">Origin Country</th>
                    <th className="py-2.5 px-3">Tool / Page</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Metrics</th>
                    <th className="py-2.5 px-3">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4E4E7] dark:divide-[#3F3F46]">
                  {activityEvents.map((e) => (
                    <tr key={e.id}>
                      <td className="py-2.5 px-3 font-mono font-semibold text-[#18181B] dark:text-[#FAFAFA]">
                        {e.eventType}
                      </td>
                      <td className="py-2.5 px-3">
                        {e.userEmail ? (
                          <span className="font-semibold text-[#18181B] dark:text-[#FAFAFA]">
                            {e.userEmail}
                          </span>
                        ) : (
                          <span className="font-mono text-[11px] text-[#71717A]">
                            {e.anonymousSessionId || 'anonymous'}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#18181B] dark:text-[#FAFAFA]">
                          <span>🌐</span>
                          <span>{e.country || 'Global'}</span>
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        {e.toolName || e.pagePath || '—'}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-md font-semibold text-[11px] ${
                            e.status === 'succeeded'
                              ? 'bg-[#16865B]/10 text-[#16865B]'
                              : e.status === 'failed'
                              ? 'bg-[#D64545]/10 text-[#D64545]'
                              : 'bg-[#F4F4F5] dark:bg-[#27272A] text-[#52525B]'
                          }`}
                        >
                          {e.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-[#71717A]">
                        {e.fileSizeBytes
                          ? formatFileSize(e.fileSizeBytes)
                          : ''}{' '}
                        {e.durationMs ? `· ${e.durationMs}ms` : ''}
                      </td>
                      <td className="py-2.5 px-3 text-[11px] text-[#71717A]">
                        {new Date(e.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: PDF PROCESSING JOBS HISTORY */}
        {activeTab === 'jobs' && (
          <div className="bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl p-6 space-y-5 shadow-2xs">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-[#18181B] dark:text-[#FAFAFA]">
                  PDF Tool Processing Jobs ({pdfJobs.length})
                </h2>
                <p className="text-xs text-[#71717A]">
                  Zero-PII operational metadata across all 30 PDFNestly tools
                  (Merge, Split, Compress, Crop, Organize, Edit, Fill Forms,
                  OCR, Redact, etc.).
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Filter jobs by tool"
                  value={eventFilterTool}
                  onChange={(e) => setEventFilterTool(e.target.value)}
                  className="px-2.5 py-1.5 text-xs rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] bg-[#FAFAFA] dark:bg-[#27272A]"
                >
                  <option value="all">All 30 PDF Tools</option>
                  {PDF_TOOLS_REGISTRY.map((t) => (
                    <option key={t.slug} value={t.slug}>
                      {t.shortTitle}
                    </option>
                  ))}
                </select>

                <select
                  aria-label="Filter jobs by status"
                  value={eventFilterStatus}
                  onChange={(e) => setEventFilterStatus(e.target.value)}
                  className="px-2.5 py-1.5 text-xs rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] bg-[#FAFAFA] dark:bg-[#27272A]"
                >
                  <option value="all">All Statuses</option>
                  <option value="completed">Completed</option>
                  <option value="failed">Failed</option>
                  <option value="processing">Processing</option>
                </select>
              </div>
            </div>

            {!pdfJobs.length ? (
              <div className="py-12 text-center text-xs text-[#71717A]">
                No PDF processing jobs match the current filter.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#E4E4E7] dark:border-[#3F3F46] text-[11px] text-[#71717A] uppercase">
                      <th className="py-2.5 px-3">Job ID</th>
                      <th className="py-2.5 px-3">Tool</th>
                      <th className="py-2.5 px-3">User / Session</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Input → Output</th>
                      <th className="py-2.5 px-3">Duration</th>
                      <th className="py-2.5 px-3">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E4E4E7] dark:divide-[#3F3F46]">
                    {pdfJobs.map((j) => (
                      <tr key={j.id}>
                        <td className="py-2.5 px-3 font-mono text-[11px]">
                          {j.id}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-[#18181B] dark:text-[#FAFAFA]">
                          {j.toolName}
                          <span className="block text-[10px] font-normal text-[#71717A]">
                            {j.category} · {j.processingLocation}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          {j.userEmail || j.anonymousSessionId || 'anonymous'}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-md font-semibold text-[11px] ${
                              j.status === 'completed'
                                ? 'bg-[#16865B]/10 text-[#16865B]'
                                : j.status === 'failed'
                                ? 'bg-[#D64545]/10 text-[#D64545]'
                                : 'bg-amber-500/15 text-amber-600'
                            }`}
                          >
                            {j.status}
                          </span>
                          {j.errorCategory && (
                            <span className="block text-[10px] text-[#D64545] mt-0.5">
                              {j.errorCategory}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-mono">
                          {formatFileSize(j.fileSizeBytes)} →{' '}
                          {j.outputSizeBytes > 0
                            ? formatFileSize(j.outputSizeBytes)
                            : '—'}
                        </td>
                        <td className="py-2.5 px-3 font-mono">
                          {j.durationMs} ms
                        </td>
                        <td className="py-2.5 px-3 text-[11px] text-[#71717A]">
                          {new Date(j.createdAt).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 5: IMMUTABLE ADMIN AUDIT LOGS */}
        {activeTab === 'audit' && (
          <div className="bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl p-6 space-y-4 shadow-2xs">
            <div>
              <h2 className="text-base font-bold text-[#18181B] dark:text-[#FAFAFA]">
                Immutable Administrator Audit Trail ({auditLogs.length})
              </h2>
              <p className="text-xs text-[#71717A]">
                Every privileged admin action (user suspension, reactivation,
                role change, session revocation, account deletion, and settings
                update) is permanently recorded.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#E4E4E7] dark:border-[#3F3F46] text-[11px] text-[#71717A] uppercase">
                    <th className="py-2.5 px-3">Action</th>
                    <th className="py-2.5 px-3">Administrator</th>
                    <th className="py-2.5 px-3">Target</th>
                    <th className="py-2.5 px-3">Summary</th>
                    <th className="py-2.5 px-3">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4E4E7] dark:divide-[#3F3F46]">
                  {auditLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="py-2.5 px-3 font-mono font-bold text-[#B91C1C] dark:text-[#EF4444]">
                        {log.action}
                      </td>
                      <td className="py-2.5 px-3 font-medium">
                        {log.adminEmail}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="font-semibold">{log.targetLabel}</span>
                        <span className="block font-mono text-[10px] text-[#71717A]">
                          {log.targetType}: {log.targetId}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-[#52525B] dark:text-[#D4D4D8]">
                        {log.summary}
                      </td>
                      <td className="py-2.5 px-3 text-[11px] text-[#71717A] whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 6: ADMIN SETTINGS & OPERATIONAL HEALTH */}
        {activeTab === 'settings' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <form
              onSubmit={handleSaveSettings}
              className="lg:col-span-7 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl p-6 space-y-5 shadow-2xs"
            >
              <div>
                <h2 className="text-base font-bold text-[#18181B] dark:text-[#FAFAFA]">
                  Global Security & Platform Settings
                </h2>
                <p className="text-xs text-[#71717A]">
                  Enforced immediately on server API routes and authentication
                  endpoints.
                </p>
              </div>

              <div className="space-y-3 pt-2">
                <label className="flex items-center justify-between p-3.5 rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] bg-[#FAFAFA] dark:bg-[#27272A] cursor-pointer">
                  <div>
                    <div className="text-xs font-bold text-[#18181B] dark:text-[#FAFAFA]">
                      Allow New User Registrations
                    </div>
                    <div className="text-[11px] text-[#71717A]">
                      When disabled, new accounts cannot be created via Google
                      or Email.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settingsForm.registrationEnabled}
                    onChange={(e) =>
                      setSettingsForm((s) => ({
                        ...s,
                        registrationEnabled: e.target.checked,
                      }))
                    }
                    className="w-4 h-4 accent-[#B91C1C]"
                  />
                </label>

                <label className="flex items-center justify-between p-3.5 rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] bg-[#FAFAFA] dark:bg-[#27272A] cursor-pointer">
                  <div>
                    <div className="text-xs font-bold text-[#18181B] dark:text-[#FAFAFA]">
                      Enable Google OAuth Sign-In
                    </div>
                    <div className="text-[11px] text-[#71717A]">
                      Allows users to sign in with Google via Firebase Auth.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settingsForm.googleAuthEnabled}
                    onChange={(e) =>
                      setSettingsForm((s) => ({
                        ...s,
                        googleAuthEnabled: e.target.checked,
                      }))
                    }
                    className="w-4 h-4 accent-[#B91C1C]"
                  />
                </label>

                <label className="flex items-center justify-between p-3.5 rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] bg-[#FAFAFA] dark:bg-[#27272A] cursor-pointer">
                  <div>
                    <div className="text-xs font-bold text-[#18181B] dark:text-[#FAFAFA]">
                      Enable Email & Password Authentication
                    </div>
                    <div className="text-[11px] text-[#71717A]">
                      Allows email/password signup, login, and password reset.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settingsForm.emailAuthEnabled}
                    onChange={(e) =>
                      setSettingsForm((s) => ({
                        ...s,
                        emailAuthEnabled: e.target.checked,
                      }))
                    }
                    className="w-4 h-4 accent-[#B91C1C]"
                  />
                </label>

                <label className="flex items-center justify-between p-3.5 rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] bg-[#FAFAFA] dark:bg-[#27272A] cursor-pointer">
                  <div>
                    <div className="text-xs font-bold text-[#18181B] dark:text-[#FAFAFA]">
                      Maintenance Mode Notice Banner
                    </div>
                    <div className="text-[11px] text-[#71717A]">
                      Displays a global operational notice banner across all
                      pages.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settingsForm.maintenanceMode}
                    onChange={(e) =>
                      setSettingsForm((s) => ({
                        ...s,
                        maintenanceMode: e.target.checked,
                      }))
                    }
                    className="w-4 h-4 accent-[#B91C1C]"
                  />
                </label>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="setting-maint-msg"
                  className="block text-xs font-semibold"
                >
                  Maintenance Banner Message
                </label>
                <input
                  id="setting-maint-msg"
                  type="text"
                  value={settingsForm.maintenanceMessage}
                  onChange={(e) =>
                    setSettingsForm((s) => ({
                      ...s,
                      maintenanceMessage: e.target.value,
                    }))
                  }
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] bg-[#FAFAFA] dark:bg-[#27272A]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label
                    htmlFor="setting-ratelimit"
                    className="block text-xs font-semibold"
                  >
                    Rate Limit (req/min)
                  </label>
                  <input
                    id="setting-ratelimit"
                    type="number"
                    min={10}
                    max={5000}
                    value={settingsForm.rateLimitPerMinute}
                    onChange={(e) =>
                      setSettingsForm((s) => ({
                        ...s,
                        rateLimitPerMinute: Number(e.target.value),
                      }))
                    }
                    className="w-full px-3 py-2 text-xs rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] bg-[#FAFAFA] dark:bg-[#27272A] font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="setting-maxupload"
                    className="block text-xs font-semibold"
                  >
                    Max Upload Size (MB)
                  </label>
                  <input
                    id="setting-maxupload"
                    type="number"
                    min={1}
                    max={500}
                    value={settingsForm.maxUploadSizeMb}
                    onChange={(e) =>
                      setSettingsForm((s) => ({
                        ...s,
                        maxUploadSizeMb: Number(e.target.value),
                      }))
                    }
                    className="w-full px-3 py-2 text-xs rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] bg-[#FAFAFA] dark:bg-[#27272A] font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="setting-retention"
                    className="block text-xs font-semibold"
                  >
                    Log Retention (Days)
                  </label>
                  <input
                    id="setting-retention"
                    type="number"
                    min={1}
                    max={3650}
                    value={settingsForm.activityRetentionDays}
                    onChange={(e) =>
                      setSettingsForm((s) => ({
                        ...s,
                        activityRetentionDays: Number(e.target.value),
                      }))
                    }
                    className="w-full px-3 py-2 text-xs rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] bg-[#FAFAFA] dark:bg-[#27272A] font-mono"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isSavingSettings}
                  className="px-5 py-2.5 rounded-xl bg-[#B91C1C] hover:bg-[#7F1D1D] text-white text-xs font-semibold cursor-pointer"
                >
                  {isSavingSettings
                    ? 'Saving Settings...'
                    : 'Save Platform Settings'}
                </button>

                <button
                  type="button"
                  onClick={handlePruneExpiredLogs}
                  className="px-4 py-2 rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] hover:border-[#B91C1C] text-xs font-semibold cursor-pointer"
                >
                  Prune Expired Logs Now
                </button>
              </div>
            </form>

            {/* Operational Health & Security Status */}
            <div className="lg:col-span-5 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl p-6 space-y-4 shadow-2xs">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-[#16865B]" />
                <h2 className="text-base font-bold text-[#18181B] dark:text-[#FAFAFA]">
                  System & Security Health
                </h2>
              </div>

              <div className="space-y-3 text-xs">
                <div className="p-3.5 rounded-xl bg-[#FAFAFA] dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46] flex items-center justify-between">
                  <div>
                    <div className="font-bold">Firebase Auth & Firestore ABAC</div>
                    <div className="text-[11px] text-[#71717A]">
                      Project: gen-lang-client-0684184057
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-md bg-[#16865B]/10 text-[#16865B] font-bold">
                    Provisioned
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-[#FAFAFA] dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46] flex items-center justify-between">
                  <div>
                    <div className="font-bold">
                      Session Signing & Password Hashing
                    </div>
                    <div className="text-[11px] text-[#71717A]">
                      HMAC-SHA256 HttpOnly Cookies + Node crypto.scrypt
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-md bg-[#16865B]/10 text-[#16865B] font-bold">
                    Active
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-[#FAFAFA] dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46] flex items-center justify-between">
                  <div>
                    <div className="font-bold">
                      PDF Processing Suite (30 Tools)
                    </div>
                    <div className="text-[11px] text-[#71717A]">
                      pdf-lib + PDF.js + Ghostscript 9.55 Ephemeral Engine
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-md bg-[#16865B]/10 text-[#16865B] font-bold">
                    Operational
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-[#FAFAFA] dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46] flex items-center justify-between">
                  <div>
                    <div className="font-bold">
                      Google Analytics 4 (G-MSPZRXHB28)
                    </div>
                    <div className="text-[11px] text-[#71717A]">
                      Deduplicated SPA page_view + Zero-PII tool events
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-md bg-[#16865B]/10 text-[#16865B] font-bold">
                    Verified
                  </span>
                </div>
              </div>

              {/* Private Email SMTP Diagnostics & Test Delivery Panel */}
              <div className="pt-4 border-t border-[#E4E4E7] dark:border-[#3F3F46] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-[#B91C1C]" />
                    <h3 className="text-sm font-bold text-[#18181B] dark:text-[#FAFAFA]">
                      Private Email SMTP Diagnostics
                    </h3>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                      emailDiagConfig?.allRequiredPresent
                        ? 'bg-[#16865B]/10 text-[#16865B]'
                        : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                    }`}
                  >
                    {emailDiagConfig?.allRequiredPresent
                      ? 'Variables Present'
                      : 'SMTP Unconfigured'}
                  </span>
                </div>

                <p className="text-[11px] text-[#71717A] leading-relaxed">
                  Verifies server-side Namecheap Private Email SMTP variables
                  without exposing secrets. Test emails are strictly sent only to
                  your authenticated admin address (<strong>{user?.email}</strong>
                  ).
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                  {[
                    {
                      label: 'PRIVATE_EMAIL_SMTP_HOST',
                      present: emailDiagConfig?.hostPresent,
                    },
                    {
                      label: 'PRIVATE_EMAIL_SMTP_PORT',
                      present: emailDiagConfig?.portPresent,
                    },
                    {
                      label: 'PRIVATE_EMAIL_SMTP_USER',
                      present: emailDiagConfig?.userPresent,
                    },
                    {
                      label: 'PRIVATE_EMAIL_SMTP_PASSWORD',
                      present: emailDiagConfig?.passwordPresent,
                    },
                    {
                      label: 'PRIVATE_EMAIL_FROM',
                      present: emailDiagConfig?.fromPresent,
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="px-2.5 py-1.5 rounded-lg bg-[#FAFAFA] dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46] flex items-center justify-between gap-2"
                    >
                      <span className="font-mono text-[10px] truncate">
                        {item.label}
                      </span>
                      <span
                        className={`font-bold text-[10px] ${
                          item.present
                            ? 'text-[#16865B]'
                            : 'text-[#D64545]'
                        }`}
                      >
                        {item.present ? 'Present' : 'Missing'}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    disabled={isCheckingSmtp || isSendingTestEmail}
                    onClick={handleVerifySmtpConnection}
                    className="px-3 py-1.5 rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] hover:border-[#B91C1C] text-xs font-semibold cursor-pointer disabled:opacity-50"
                  >
                    {isCheckingSmtp
                      ? 'Checking SSL/TLS...'
                      : 'Verify SMTP Connection'}
                  </button>

                  <button
                    type="button"
                    disabled={isCheckingSmtp || isSendingTestEmail}
                    onClick={handleSendAdminTestEmail}
                    className="px-3 py-1.5 rounded-xl bg-[#B91C1C] hover:bg-[#7F1D1D] text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                  >
                    {isSendingTestEmail
                      ? 'Sending Test Email...'
                      : 'Send Test Email to Admin'}
                  </button>
                </div>

                {emailDiagResult && (
                  <div
                    role="status"
                    className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                      emailDiagResult.messageSubmitted ||
                      (emailDiagResult.connectionVerified &&
                        emailDiagResult.messageSubmitted === undefined)
                        ? 'bg-[#16865B]/10 border-[#16865B]/30 text-[#18181B] dark:text-[#FAFAFA]'
                        : 'bg-[#D64545]/10 border-[#D64545]/30 text-[#D64545] dark:text-[#F87171]'
                    }`}
                  >
                    <div className="font-bold flex items-center justify-between">
                      <span>
                        Category:{' '}
                        <code className="font-mono">
                          {emailDiagResult.errorCategory}
                        </code>
                      </span>
                      <span>
                        TLS/Auth:{' '}
                        {emailDiagResult.connectionVerified ? 'OK' : 'Failed'}
                      </span>
                    </div>
                    <p className="text-[11px] leading-relaxed">
                      {emailDiagResult.sanitizedMessage}
                    </p>
                    {emailDiagResult.messageId && (
                      <div className="text-[10px] font-mono text-[#71717A]">
                        SMTP Message-ID: {emailDiagResult.messageId}
                      </div>
                    )}
                    {emailDiagResult.deliveryDistinctionNote && (
                      <p className="text-[10px] text-[#71717A] italic">
                        {emailDiagResult.deliveryDistinctionNote}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* User Detail Inspection Modal */}
      {selectedUserDetail && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="user-detail-title"
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
        >
          <div className="bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 space-y-5 shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-[#E4E4E7] dark:border-[#3F3F46] pb-4">
              <div>
                <h3
                  id="user-detail-title"
                  className="text-lg font-bold text-[#18181B] dark:text-[#FAFAFA]"
                >
                  {selectedUserDetail.user.displayName} (
                  {selectedUserDetail.user.email})
                </h3>
                <p className="text-xs text-[#71717A] font-mono">
                  UID: {selectedUserDetail.user.uid} · Provider:{' '}
                  {selectedUserDetail.user.provider} · Role:{' '}
                  {selectedUserDetail.user.role} · Status:{' '}
                  {selectedUserDetail.user.status}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedUserDetail(null)}
                aria-label="Close user inspector"
                className="p-1.5 rounded-lg border border-[#E4E4E7] dark:border-[#3F3F46] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Admin Actions in Inspector */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setConfirmActionModal({
                    type: 'revoke_sessions',
                    targetUser: selectedUserDetail.user,
                  })
                }
                className="px-3 py-1.5 rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] text-xs font-semibold hover:border-[#B91C1C] cursor-pointer"
              >
                Force Logout / Revoke Sessions (
                {
                  selectedUserDetail.sessions.filter((s) => !s.revokedAt)
                    .length
                }
                )
              </button>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#71717A]">
                Recent Sessions ({selectedUserDetail.sessions.length})
              </h4>
              <div className="max-h-36 overflow-y-auto divide-y divide-[#E4E4E7] dark:divide-[#3F3F46] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-xl p-3 text-xs">
                {!selectedUserDetail.sessions.length ? (
                  <div className="text-[#71717A]">No sessions recorded.</div>
                ) : (
                  selectedUserDetail.sessions.map((s) => (
                    <div
                      key={s.id}
                      className="py-1.5 flex items-center justify-between gap-2"
                    >
                      <span className="truncate max-w-xs">{s.userAgent}</span>
                      <span className="font-mono text-[11px] text-[#71717A]">
                        {s.revokedAt
                          ? 'Revoked'
                          : `Active (${new Date(s.lastSeenAt).toLocaleDateString()})`}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#71717A]">
                Recent PDF Jobs ({selectedUserDetail.recentJobs.length})
              </h4>
              <div className="max-h-40 overflow-y-auto divide-y divide-[#E4E4E7] dark:divide-[#3F3F46] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-xl p-3 text-xs">
                {!selectedUserDetail.recentJobs.length ? (
                  <div className="text-[#71717A]">No PDF jobs recorded.</div>
                ) : (
                  selectedUserDetail.recentJobs.map((j) => (
                    <div
                      key={j.id}
                      className="py-1.5 flex items-center justify-between"
                    >
                      <span className="font-semibold">{j.toolName}</span>
                      <span className="font-mono text-[11px] text-[#71717A]">
                        {j.status} · {formatFileSize(j.fileSizeBytes)} ·{' '}
                        {new Date(j.createdAt).toLocaleString()}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog for Privileged User Actions */}
      {confirmActionModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-admin-action-title"
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
        >
          <div className="bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3
              id="confirm-admin-action-title"
              className="text-base font-bold text-[#18181B] dark:text-[#FAFAFA]"
            >
              Confirm Administrator Action
            </h3>
            <p className="text-xs text-[#52525B] dark:text-[#D4D4D8] leading-relaxed">
              Are you sure you want to execute{' '}
              <strong className="font-mono">{confirmActionModal.type}</strong>{' '}
              on account{' '}
              <strong>
                {confirmActionModal.targetUser.displayName} (
                {confirmActionModal.targetUser.email})
              </strong>
              ? This action will be permanently recorded in the Admin Audit Log.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmActionModal(null)}
                className="px-4 py-2 rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteConfirmedUserAction}
                className="px-4 py-2 rounded-xl bg-[#B91C1C] hover:bg-[#7F1D1D] text-white text-xs font-semibold cursor-pointer"
              >
                Confirm & Execute
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
