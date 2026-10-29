'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  User,
  Shield,
  FileText,
  Clock,
  CheckCircle2,
  AlertCircle,
  Download,
  Trash2,
  LogOut,
  RefreshCw,
  Settings,
  Activity,
  ExternalLink,
  Lock,
} from 'lucide-react';
import { useAuth, ClientUserProfile } from '@/components/AuthProvider';
import { formatFileSize } from '@/lib/pdf-utils';

interface DashboardJob {
  id: string;
  toolSlug: string;
  toolName: string;
  category: string;
  status: 'processing' | 'completed' | 'failed';
  fileSizeBytes: number;
  outputSizeBytes: number;
  durationMs: number;
  errorCategory: string | null;
  createdAt: string;
}

interface DashboardActivity {
  id: string;
  eventType: string;
  toolSlug: string | null;
  toolName: string | null;
  pagePath: string | null;
  status: string;
  durationMs: number | null;
  fileSizeBytes: number | null;
  createdAt: string;
}

interface DashboardPayload {
  profile: ClientUserProfile;
  recentJobs: DashboardJob[];
  recentActivity: DashboardActivity[];
  activeSessionsCount: number;
  stats: {
    totalJobs: number;
    completedJobs: number;
    failedJobs: number;
    totalBytesProcessed: number;
    favoriteTool: string | null;
  };
}

export default function UserDashboardPage() {
  const router = useRouter();
  const { user, isLoading: authLoading, logout, refreshSession } = useAuth();

  const [data, setData] = useState<DashboardPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'history' | 'activity' | 'settings'>(
    'history'
  );

  // Settings form state
  const [displayName, setDisplayName] = useState('');
  const [photoURL, setPhotoURL] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileNotice, setProfileNotice] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Verification email status state
  const [isSendingVerifyEmail, setIsSendingVerifyEmail] = useState(false);
  const [verifyEmailNotice, setVerifyEmailNotice] = useState<{
    type: 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);

  // Delete account modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/user/dashboard', { cache: 'no-store' });
      if (res.status === 401) {
        router.push('/login?redirect=/dashboard');
        return;
      }
      const json = await res.json();
      if (res.ok && json.profile) {
        setData(json);
        setDisplayName(json.profile.displayName || '');
        setPhotoURL(json.profile.photoURL || '');
      }
    } catch {
      // Ignore fetch errors
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.push('/login?redirect=/dashboard');
      } else {
        loadDashboard();
      }
    }
  }, [authLoading, user, router, loadDashboard]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileNotice(null);
    setIsSavingProfile(true);

    try {
      const res = await fetch('/api/user/dashboard', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName,
          photoURL,
          ...(newPassword
            ? { currentPassword, newPassword }
            : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to update profile.');
      }
      setCurrentPassword('');
      setNewPassword('');
      setProfileNotice({
        type: 'success',
        text: json.message || 'Account settings saved.',
      });
      await refreshSession();
      await loadDashboard();
    } catch (err) {
      setProfileNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Update failed.',
      });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleResendVerificationEmail = async () => {
    setIsSendingVerifyEmail(true);
    setVerifyEmailNotice(null);
    try {
      const res = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resend' }),
      });
      const json = await res.json();
      if (!res.ok) {
        setVerifyEmailNotice({
          type: 'error',
          text: json.error || 'Unable to send verification email.',
        });
        return;
      }
      setVerifyEmailNotice({
        type: json.emailSent ? 'success' : 'warning',
        text:
          json.message ||
          (json.emailSent
            ? 'Verification email sent! Please check your inbox and spam folder.'
            : 'Outbound email delivery is not yet configured on this server.'),
      });
    } catch {
      setVerifyEmailNotice({
        type: 'error',
        text: 'Unable to request verification email right now.',
      });
    } finally {
      setIsSendingVerifyEmail(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') return;
    setIsDeleting(true);
    try {
      const res = await fetch('/api/user/dashboard', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmText: deleteConfirmText }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Account deletion failed.');
      }
      await logout();
      router.push('/');
    } catch (err) {
      setProfileNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to delete account.',
      });
      setShowDeleteModal(false);
    } finally {
      setIsDeleting(false);
    }
  };

  if (authLoading || (isLoading && !data)) {
    return (
      <div className="min-h-[65vh] flex items-center justify-center">
        <div className="flex items-center gap-2.5 text-sm font-medium text-[#52525B] dark:text-[#D4D4D8]">
          <RefreshCw className="w-4 h-4 animate-spin text-[#B91C1C]" />
          <span>Loading your PDFNestly account workspace...</span>
        </div>
      </div>
    );
  }

  const profile = data?.profile || user;
  if (!profile) return null;

  return (
    <div className="bg-[#FAFAFA] dark:bg-[#09090B] min-h-[calc(100vh-4rem)] py-8 px-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Top Profile Header Card */}
        <div className="bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl p-6 shadow-2xs flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-[#FEF2F2] dark:bg-[#B91C1C]/15 border border-[#FECACA] dark:border-[#B91C1C]/30 flex items-center justify-center text-[#B91C1C] dark:text-[#EF4444] text-xl font-bold shrink-0 overflow-hidden">
              {profile.photoURL ? (
                <img
                  src={profile.photoURL}
                  alt={profile.displayName}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                profile.displayName.slice(0, 2).toUpperCase()
              )}
            </div>

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-[#18181B] dark:text-[#FAFAFA]">
                  {profile.displayName}
                </h1>
                <span className="px-2.5 py-0.5 text-[11px] font-semibold rounded-md bg-[#F4F4F5] dark:bg-[#27272A] text-[#52525B] dark:text-[#D4D4D8] border border-[#E4E4E7] dark:border-[#3F3F46]">
                  {profile.provider === 'google'
                    ? 'Google OAuth'
                    : 'Email & Password'}
                </span>
                {profile.role === 'admin' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-bold rounded-md bg-[#FEF2F2] dark:bg-[#B91C1C]/20 text-[#B91C1C] dark:text-[#EF4444] border border-[#FECACA] dark:border-[#B91C1C]/40">
                    <Shield className="w-3 h-3" />
                    Administrator
                  </span>
                )}
                {profile.emailVerified ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-md bg-[#16865B]/10 text-[#16865B] dark:text-[#34D399]">
                    <CheckCircle2 className="w-3 h-3" />
                    Verified
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={isSendingVerifyEmail}
                    onClick={handleResendVerificationEmail}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-semibold rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 hover:underline cursor-pointer disabled:opacity-60"
                  >
                    <AlertCircle className="w-3 h-3" />
                    {isSendingVerifyEmail
                      ? 'Sending Verification Email...'
                      : 'Send Verification Email'}
                  </button>
                )}
              </div>

              <div className="text-xs text-[#52525B] dark:text-[#A1A1AA] flex flex-wrap items-center gap-x-4 gap-y-1">
                <span>{profile.email}</span>
                <span>
                  Joined{' '}
                  {new Date(profile.createdAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
                <span>
                  Active Sessions: {data?.activeSessionsCount ?? 1}
                </span>
              </div>

              {verifyEmailNotice && (
                <div
                  role="status"
                  className={`mt-2 p-2.5 rounded-xl border text-xs font-medium ${
                    verifyEmailNotice.type === 'success'
                      ? 'bg-[#16865B]/10 border-[#16865B]/30 text-[#16865B] dark:text-[#34D399]'
                      : verifyEmailNotice.type === 'warning'
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-300'
                      : 'bg-[#D64545]/10 border-[#D64545]/30 text-[#D64545] dark:text-[#F87171]'
                  }`}
                >
                  {verifyEmailNotice.text}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {profile.role === 'admin' && (
              <Link
                href="/admin"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#B91C1C] hover:bg-[#7F1D1D] text-white text-xs font-semibold transition-colors shadow-xs"
              >
                <Shield className="w-4 h-4" />
                <span>Open Admin Console</span>
              </Link>
            )}

            <a
              href="/api/user/export"
              download
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] bg-[#FAFAFA] dark:bg-[#27272A] hover:border-[#B91C1C] text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA] transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Account Data (JSON)</span>
            </a>

            <button
              type="button"
              onClick={async () => {
                await logout();
                router.push('/');
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] bg-white dark:bg-[#18181B] hover:border-[#D64545] text-xs font-semibold text-[#D64545] transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>

        {/* KPI Summary Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-xl space-y-1">
            <div className="text-xs font-medium text-[#71717A] flex items-center justify-between">
              <span>Total PDF Jobs</span>
              <FileText className="w-4 h-4 text-[#B91C1C]" />
            </div>
            <div className="text-2xl font-bold text-[#18181B] dark:text-[#FAFAFA] font-mono">
              {data?.stats.totalJobs ?? 0}
            </div>
            <div className="text-[11px] text-[#52525B] dark:text-[#A1A1AA]">
              {data?.stats.completedJobs ?? 0} completed ·{' '}
              {data?.stats.failedJobs ?? 0} failed
            </div>
          </div>

          <div className="p-5 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-xl space-y-1">
            <div className="text-xs font-medium text-[#71717A] flex items-center justify-between">
              <span>Volume Processed</span>
              <Activity className="w-4 h-4 text-[#16865B]" />
            </div>
            <div className="text-2xl font-bold text-[#18181B] dark:text-[#FAFAFA] font-mono">
              {formatFileSize(data?.stats.totalBytesProcessed ?? 0)}
            </div>
            <div className="text-[11px] text-[#52525B] dark:text-[#A1A1AA]">
              Zero-retention document processing
            </div>
          </div>

          <div className="p-5 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-xl space-y-1">
            <div className="text-xs font-medium text-[#71717A] flex items-center justify-between">
              <span>Most Used Tool</span>
              <Clock className="w-4 h-4 text-[#B91C1C]" />
            </div>
            <div className="text-lg font-bold text-[#18181B] dark:text-[#FAFAFA] truncate">
              {data?.stats.favoriteTool || 'No jobs yet'}
            </div>
            <div className="text-[11px] text-[#52525B] dark:text-[#A1A1AA]">
              <Link href="/tools" className="text-[#B91C1C] hover:underline">
                Launch a PDF tool →
              </Link>
            </div>
          </div>

          <div className="p-5 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-xl space-y-1">
            <div className="text-xs font-medium text-[#71717A] flex items-center justify-between">
              <span>Account Status</span>
              <User className="w-4 h-4 text-[#16865B]" />
            </div>
            <div className="text-lg font-bold text-[#16865B] capitalize">
              {profile.status}
            </div>
            <div className="text-[11px] text-[#52525B] dark:text-[#A1A1AA]">
              Role: <strong className="uppercase">{profile.role}</strong>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl overflow-hidden shadow-2xs">
          <div className="border-b border-[#E4E4E7] dark:border-[#3F3F46] px-6 flex flex-wrap items-center justify-between gap-4">
            <div role="tablist" className="flex items-center gap-6">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'history'}
                onClick={() => setActiveTab('history')}
                className={`py-4 text-xs font-bold border-b-2 transition-colors flex items-center gap-2 cursor-pointer ${
                  activeTab === 'history'
                    ? 'border-[#B91C1C] text-[#B91C1C] dark:text-[#EF4444]'
                    : 'border-transparent text-[#52525B] dark:text-[#A1A1AA] hover:text-[#18181B]'
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>
                  PDF Processing History ({data?.recentJobs.length ?? 0})
                </span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'activity'}
                onClick={() => setActiveTab('activity')}
                className={`py-4 text-xs font-bold border-b-2 transition-colors flex items-center gap-2 cursor-pointer ${
                  activeTab === 'activity'
                    ? 'border-[#B91C1C] text-[#B91C1C] dark:text-[#EF4444]'
                    : 'border-transparent text-[#52525B] dark:text-[#A1A1AA] hover:text-[#18181B]'
                }`}
              >
                <Activity className="w-4 h-4" />
                <span>
                  Recent Activity Events ({data?.recentActivity.length ?? 0})
                </span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'settings'}
                onClick={() => setActiveTab('settings')}
                className={`py-4 text-xs font-bold border-b-2 transition-colors flex items-center gap-2 cursor-pointer ${
                  activeTab === 'settings'
                    ? 'border-[#B91C1C] text-[#B91C1C] dark:text-[#EF4444]'
                    : 'border-transparent text-[#52525B] dark:text-[#A1A1AA] hover:text-[#18181B]'
                }`}
              >
                <Settings className="w-4 h-4" />
                <span>Profile & Security Settings</span>
              </button>
            </div>

            <button
              type="button"
              onClick={loadDashboard}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#E4E4E7] dark:border-[#3F3F46] hover:bg-[#FAFAFA] dark:hover:bg-[#27272A] cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>
          </div>

          <div className="p-6">
            {activeTab === 'history' && (
              <div className="space-y-4">
                <div className="p-3.5 rounded-xl bg-[#FAFAFA] dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46] text-xs text-[#52525B] dark:text-[#D4D4D8] flex items-center justify-between gap-4">
                  <span>
                    <strong>Document Retention Policy:</strong> For your privacy,
                    PDFNestly never retains uploaded or output PDF files on our
                    servers after processing completes. Only anonymized job
                    metadata (tool type, status, file size, and duration) is
                    listed below.
                  </span>
                </div>

                {!data?.recentJobs.length ? (
                  <div className="py-12 text-center space-y-3">
                    <FileText className="w-10 h-10 text-[#A1A1AA] mx-auto" />
                    <div className="text-sm font-semibold text-[#18181B] dark:text-[#FAFAFA]">
                      No PDF processing jobs recorded yet
                    </div>
                    <p className="text-xs text-[#71717A] max-w-md mx-auto">
                      When you merge, split, compress, crop, organize, or edit a
                      PDF while signed in, your job history will appear here.
                    </p>
                    <div className="pt-2">
                      <Link
                        href="/tools"
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#B91C1C] text-white text-xs font-semibold hover:bg-[#7F1D1D]"
                      >
                        Explore All 30 PDF Tools →
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-[#E4E4E7] dark:border-[#3F3F46] text-[#71717A] uppercase tracking-wider text-[11px]">
                          <th className="py-3 px-3">Tool</th>
                          <th className="py-3 px-3">Status</th>
                          <th className="py-3 px-3">Input Size</th>
                          <th className="py-3 px-3">Output Size</th>
                          <th className="py-3 px-3">Duration</th>
                          <th className="py-3 px-3">Timestamp</th>
                          <th className="py-3 px-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E4E4E7] dark:divide-[#3F3F46]">
                        {data.recentJobs.map((job) => (
                          <tr
                            key={job.id}
                            className="hover:bg-[#FAFAFA] dark:hover:bg-[#27272A]/60"
                          >
                            <td className="py-3 px-3 font-semibold text-[#18181B] dark:text-[#FAFAFA]">
                              {job.toolName}
                              <span className="block text-[11px] font-normal text-[#71717A]">
                                {job.category}
                              </span>
                            </td>
                            <td className="py-3 px-3">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold text-[11px] ${
                                  job.status === 'completed'
                                    ? 'bg-[#16865B]/10 text-[#16865B] dark:text-[#34D399]'
                                    : job.status === 'failed'
                                    ? 'bg-[#D64545]/10 text-[#D64545] dark:text-[#F87171]'
                                    : 'bg-amber-500/15 text-amber-600'
                                }`}
                              >
                                {job.status}
                              </span>
                              {job.errorCategory && (
                                <span className="block text-[10px] text-[#D64545] mt-0.5">
                                  {job.errorCategory}
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-3 font-mono">
                              {formatFileSize(job.fileSizeBytes)}
                            </td>
                            <td className="py-3 px-3 font-mono">
                              {job.outputSizeBytes > 0
                                ? formatFileSize(job.outputSizeBytes)
                                : '—'}
                            </td>
                            <td className="py-3 px-3 font-mono">
                              {job.durationMs > 0 ? `${job.durationMs} ms` : '—'}
                            </td>
                            <td className="py-3 px-3 text-[#52525B] dark:text-[#A1A1AA]">
                              {new Date(job.createdAt).toLocaleString()}
                            </td>
                            <td className="py-3 px-3 text-right">
                              <Link
                                href={`/${job.toolSlug}`}
                                className="inline-flex items-center gap-1 text-[#B91C1C] dark:text-[#EF4444] font-semibold hover:underline"
                              >
                                <span>Open Tool</span>
                                <ExternalLink className="w-3 h-3" />
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'activity' && (
              <div className="space-y-3">
                {!data?.recentActivity.length ? (
                  <div className="py-10 text-center text-xs text-[#71717A]">
                    No recent activity events recorded.
                  </div>
                ) : (
                  <div className="divide-y divide-[#E4E4E7] dark:divide-[#3F3F46]">
                    {data.recentActivity.map((ev) => (
                      <div
                        key={ev.id}
                        className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-semibold px-2.5 py-1 rounded-md bg-[#F4F4F5] dark:bg-[#27272A] text-[#18181B] dark:text-[#FAFAFA]">
                            {ev.eventType}
                          </span>
                          <span className="text-[#52525B] dark:text-[#D4D4D8]">
                            {ev.toolName
                              ? `Tool: ${ev.toolName}`
                              : ev.pagePath
                              ? `Page: ${ev.pagePath}`
                              : 'Account authentication event'}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-[11px] text-[#71717A] font-mono">
                          {ev.fileSizeBytes ? (
                            <span>{formatFileSize(ev.fileSizeBytes)}</span>
                          ) : null}
                          {ev.durationMs ? <span>{ev.durationMs} ms</span> : null}
                          <span>{new Date(ev.createdAt).toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'settings' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <form
                  onSubmit={handleSaveProfile}
                  className="lg:col-span-7 space-y-5"
                >
                  <h2 className="text-base font-bold text-[#18181B] dark:text-[#FAFAFA]">
                    Update Profile & Password
                  </h2>

                  {!profile.emailVerified && profile.provider === 'email' && (
                    <div
                      role="alert"
                      className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs text-amber-900 dark:text-amber-200 space-y-2"
                    >
                      <div className="font-semibold flex items-center gap-1.5">
                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>Email Verification Required for Account Changes</span>
                      </div>
                      <p className="leading-relaxed">
                        Please verify your email address (<strong>{profile.email}</strong>) before modifying your profile name, avatar, or password.
                      </p>
                      <button
                        type="button"
                        disabled={isSendingVerifyEmail}
                        onClick={handleResendVerificationEmail}
                        className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs cursor-pointer disabled:opacity-50"
                      >
                        {isSendingVerifyEmail
                          ? 'Sending Verification Email...'
                          : 'Resend Verification Email'}
                      </button>
                    </div>
                  )}

                  {profileNotice && (
                    <div
                      role="status"
                      className={`p-3.5 rounded-xl border text-xs font-medium ${
                        profileNotice.type === 'success'
                          ? 'bg-[#16865B]/10 border-[#16865B]/30 text-[#16865B] dark:text-[#34D399]'
                          : 'bg-[#D64545]/10 border-[#D64545]/30 text-[#D64545] dark:text-[#F87171]'
                      }`}
                    >
                      {profileNotice.text}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label
                      htmlFor="dash-display-name"
                      className="block text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA]"
                    >
                      Full Name
                    </label>
                    <input
                      id="dash-display-name"
                      type="text"
                      required
                      minLength={2}
                      maxLength={120}
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] bg-[#FAFAFA] dark:bg-[#27272A]"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="dash-photo-url"
                      className="block text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA]"
                    >
                      Avatar URL (Optional)
                    </label>
                    <input
                      id="dash-photo-url"
                      type="url"
                      value={photoURL}
                      onChange={(e) => setPhotoURL(e.target.value)}
                      placeholder="https://example.com/avatar.png"
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] bg-[#FAFAFA] dark:bg-[#27272A]"
                    />
                  </div>

                  <div className="pt-3 border-t border-[#E4E4E7] dark:border-[#3F3F46] space-y-4">
                    <div className="flex items-center gap-2 text-xs font-bold text-[#18181B] dark:text-[#FAFAFA]">
                      <Lock className="w-3.5 h-3.5 text-[#B91C1C]" />
                      <span>Change Password (Optional)</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label
                          htmlFor="dash-current-pw"
                          className="block text-xs font-medium text-[#52525B] dark:text-[#D4D4D8]"
                        >
                          Current Password
                        </label>
                        <input
                          id="dash-current-pw"
                          type="password"
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          placeholder="Leave blank if unchanged"
                          className="w-full px-3.5 py-2 text-sm rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] bg-[#FAFAFA] dark:bg-[#27272A]"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label
                          htmlFor="dash-new-pw"
                          className="block text-xs font-medium text-[#52525B] dark:text-[#D4D4D8]"
                        >
                          New Password
                        </label>
                        <input
                          id="dash-new-pw"
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Min 8 chars, letter + number"
                          className="w-full px-3.5 py-2 text-sm rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] bg-[#FAFAFA] dark:bg-[#27272A]"
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSavingProfile}
                    className="px-5 py-2.5 rounded-xl bg-[#B91C1C] hover:bg-[#7F1D1D] text-white text-xs font-semibold transition-colors cursor-pointer"
                  >
                    {isSavingProfile ? 'Saving Changes...' : 'Save Account Settings'}
                  </button>
                </form>

                {/* Danger Zone: Account Deletion */}
                <div className="lg:col-span-5 space-y-4">
                  <div className="p-5 rounded-2xl border border-[#D64545]/30 bg-[#D64545]/5 space-y-3">
                    <h3 className="text-sm font-bold text-[#D64545] flex items-center gap-2">
                      <Trash2 className="w-4 h-4" />
                      <span>Delete Account Permanently</span>
                    </h3>
                    <p className="text-xs text-[#52525B] dark:text-[#D4D4D8] leading-relaxed">
                      Deleting your account permanently removes your profile,
                      active sessions, and PDF processing history. Public PDF
                      tools will remain usable without an account.
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowDeleteModal(true)}
                      className="px-4 py-2 rounded-xl bg-[#D64545] hover:bg-[#B91C1C] text-white text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Delete My Account...
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete Account Confirmation Modal */}
      {showDeleteModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-account-title"
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
        >
          <div className="bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3
              id="delete-account-title"
              className="text-base font-bold text-[#18181B] dark:text-[#FAFAFA]"
            >
              Confirm Permanent Account Deletion
            </h3>
            <p className="text-xs text-[#52525B] dark:text-[#D4D4D8] leading-relaxed">
              This action is irreversible. Type <strong>DELETE</strong> below to
              permanently remove your PDFNestly account ({profile.email}).
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="Type DELETE to confirm"
              aria-label="Type DELETE to confirm"
              className="w-full px-3.5 py-2 text-sm rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] bg-[#FAFAFA] dark:bg-[#27272A]"
            />
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteConfirmText('');
                }}
                className="px-4 py-2 rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteConfirmText !== 'DELETE' || isDeleting}
                onClick={handleDeleteAccount}
                className="px-4 py-2 rounded-xl bg-[#D64545] text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
              >
                {isDeleting ? 'Deleting...' : 'Permanently Delete Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
