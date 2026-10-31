'use client';

import React, { useState } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  Cpu,
  Database,
  DollarSign,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Filter,
  Globe,
  HardDrive,
  Laptop,
  Layers,
  Monitor,
  Radio,
  RefreshCw,
  Search,
  Server,
  Shield,
  ShieldAlert,
  Smartphone,
  Tablet,
  TrendingUp,
  Users,
  Wrench,
  Zap,
} from 'lucide-react';
import { formatFileSize } from '@/lib/pdf-utils';
import type {
  ExternalServiceConnectionStatus,
  KpiComparisonMetric,
  RealTimeAnalyticsSnapshot,
  AcquisitionChannelRow,
  DeviceTechnologySnapshot,
  ToolAnalyticsDetailRow,
  FunnelStepMetric,
  ErrorIncidentRecord,
  SystemHealthMetrics,
} from '@/lib/admin-analytics-engine';

export interface EnterpriseBundleData {
  generatedAt: string;
  reportingTimezone: string;
  range: string;
  rangeLabel: string;
  periodDays: number;
  currentPeriod: { startIso: string; endIso: string };
  previousPeriod: { startIso: string; endIso: string };
  integrations: ExternalServiceConnectionStatus[];
  kpiComparisons: Record<string, KpiComparisonMetric>;
  realtime: RealTimeAnalyticsSnapshot;
  acquisition: AcquisitionChannelRow[];
  devices: DeviceTechnologySnapshot;
  toolsAnalytics: ToolAnalyticsDetailRow[];
  funnels: {
    pdfProcessing: FunnelStepMetric[];
  };
  errorMonitoring: {
    incidents: ErrorIncidentRecord[];
    recentFailedJobs: Array<{
      id: string;
      toolSlug: string;
      toolName: string;
      status: string;
      fileSizeBytes: number;
      durationMs: number;
      errorCategory: string | null;
      createdAt: string;
    }>;
  };
  userAnalytics: {
    totalRegistered: number;
    newRegistrationsInPeriod: number;
    dau: number;
    wau: number;
    mau: number;
    adminCount: number;
    suspendedCount: number;
  };
  systemHealth: SystemHealthMetrics;
}

export function KpiComparisonCard({ metric }: { metric: KpiComparisonMetric }) {
  const isPositive = metric.percentChange >= 0;
  const formattedVal =
    metric.unit === 'percent'
      ? `${metric.currentValue}%`
      : metric.unit === 'ms'
      ? `${metric.currentValue} ms`
      : metric.unit === 'bytes'
      ? formatFileSize(metric.currentValue)
      : metric.currentValue.toLocaleString();

  const formattedPrev =
    metric.unit === 'percent'
      ? `${metric.previousValue}%`
      : metric.unit === 'ms'
      ? `${metric.previousValue} ms`
      : metric.unit === 'bytes'
      ? formatFileSize(metric.previousValue)
      : metric.previousValue.toLocaleString();

  return (
    <div className="p-4 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl space-y-2 shadow-2xs">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-[#52525B] dark:text-[#A1A1AA]">
          {metric.label}
        </span>
        <span className="px-2 py-0.5 text-[10px] font-mono font-semibold rounded-md bg-[#F4F4F5] dark:bg-[#27272A] text-[#52525B] dark:text-[#D4D4D8]">
          {metric.source === 'First-Party Backend' ? '1P Backend' : metric.source}
        </span>
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <span className="text-2xl font-bold font-mono text-[#18181B] dark:text-[#FAFAFA]">
          {metric.available ? formattedVal : 'Unavailable'}
        </span>
        <span
          className={`inline-flex items-center gap-0.5 text-xs font-bold font-mono px-2 py-0.5 rounded-full ${
            isPositive
              ? 'bg-[#16865B]/15 text-[#16865B] dark:text-[#34D399]'
              : 'bg-[#D64545]/15 text-[#D64545] dark:text-[#F87171]'
          }`}
        >
          {isPositive ? (
            <ArrowUpRight className="w-3.5 h-3.5" />
          ) : (
            <ArrowDownRight className="w-3.5 h-3.5" />
          )}
          {Math.abs(metric.percentChange)}%
        </span>
      </div>

      <div className="flex items-center justify-between text-[11px] text-[#71717A] pt-1 border-t border-[#F4F4F5] dark:border-[#27272A]">
        <span>Prev period: {formattedPrev}</span>
        <span>Updated {new Date(metric.lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
    </div>
  );
}

export function AdminRealtimeSection({ data }: { data: EnterpriseBundleData }) {
  const rt = data.realtime;
  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-[#B91C1C]/15 via-[#18181B] to-[#18181B] border border-[#B91C1C]/40 rounded-2xl p-5 text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
              Live Operational Stream (Last {rt.activeWindowMinutes} Minutes)
            </span>
          </div>
          <h2 className="text-lg font-bold">Real-Time Website & PDF Processing Telemetry</h2>
          <p className="text-xs text-slate-300">
            Active user counts are estimated from active session heartbeats and first-party event triggers in the last 30 minutes.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <div className="px-3.5 py-2 rounded-xl bg-white/10 border border-white/15">
            <div className="text-[10px] text-slate-300 uppercase">Data Source</div>
            <div className="font-bold">1P Event Stream + Session Heartbeat</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl space-y-1">
          <span className="text-xs font-medium text-[#71717A]">Estimated Active Users (30m)</span>
          <div className="text-3xl font-bold font-mono text-[#18181B] dark:text-[#FAFAFA]">
            {rt.estimatedActiveUsers}
          </div>
          <p className="text-[11px] text-[#52525B] dark:text-[#A1A1AA]">
            {rt.activeAuthenticatedSessions} authenticated session(s)
          </p>
        </div>

        <div className="p-5 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl space-y-1">
          <span className="text-xs font-medium text-[#71717A]">PDF Jobs In Progress</span>
          <div className="text-3xl font-bold font-mono text-[#B91C1C]">
            {rt.jobsInProgress}
          </div>
          <p className="text-[11px] text-[#52525B] dark:text-[#A1A1AA]">
            Active worker executions right now
          </p>
        </div>

        <div className="p-5 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl space-y-1">
          <span className="text-xs font-medium text-[#71717A]">Succeeded Jobs (Last 30m)</span>
          <div className="text-3xl font-bold font-mono text-[#16865B] dark:text-[#34D399]">
            {rt.recentSucceededJobsLast30m}
          </div>
          <p className="text-[11px] text-[#52525B] dark:text-[#A1A1AA]">
            Verified output files generated
          </p>
        </div>

        <div className="p-5 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl space-y-1">
          <span className="text-xs font-medium text-[#71717A]">Failed Jobs (Last 30m)</span>
          <div className="text-3xl font-bold font-mono text-[#D64545]">
            {rt.recentFailedJobsLast30m}
          </div>
          <p className="text-[11px] text-[#52525B] dark:text-[#A1A1AA]">
            Exceptions caught by telemetry
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-[#18181B] dark:text-[#FAFAFA]">
            Recently Viewed Pages & Active Tools
          </h3>
          {rt.recentPagesViewed.length === 0 ? (
            <p className="text-xs text-[#71717A]">No page views recorded in the last 30 minutes.</p>
          ) : (
            <div className="space-y-2">
              {rt.recentPagesViewed.map((p) => (
                <div
                  key={p.pagePath}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-[#FAFAFA] dark:bg-[#27272A]/60 text-xs"
                >
                  <span className="font-mono font-semibold text-[#18181B] dark:text-[#FAFAFA]">
                    {p.pagePath}
                  </span>
                  <span className="font-mono font-bold text-[#B91C1C]">{p.count} hits</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-[#18181B] dark:text-[#FAFAFA]">
            Live Event Stream (Most Recent 15 Triggers)
          </h3>
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {rt.recentEventsStream.slice(0, 15).map((ev) => (
              <div
                key={ev.id}
                className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] text-xs"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-[#18181B] dark:text-[#FAFAFA] truncate">
                    {ev.eventType} {ev.toolName ? `· ${ev.toolName}` : ''}
                  </div>
                  <div className="text-[11px] text-[#71717A]">
                    {ev.pagePath} · {ev.country}
                  </div>
                </div>
                <span className="text-[11px] font-mono text-[#71717A] shrink-0">
                  {new Date(ev.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AdminTrafficAndAcquisitionSection({
  data,
  mode,
}: {
  data: EnterpriseBundleData;
  mode: 'traffic' | 'acquisition';
}) {
  const ga4Status = data.integrations.find((i) => i.service === 'ga4');
  return (
    <div className="space-y-6">
      {/* GA4 Status Banner */}
      <div className="p-4 rounded-2xl border border-[#E4E4E7] dark:border-[#3F3F46] bg-white dark:bg-[#18181B] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span
              className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-md ${
                ga4Status?.configured
                  ? 'bg-[#16865B]/15 text-[#16865B]'
                  : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
              }`}
            >
              {ga4Status?.configured ? 'GA4 Data API Connected' : '1P Backend Attribution Active'}
            </span>
            <h3 className="text-sm font-bold text-[#18181B] dark:text-[#FAFAFA]">
              {mode === 'traffic'
                ? 'Traffic & Engagement Analytics'
                : 'Traffic Acquisition & Source Attribution'}
            </h3>
          </div>
          <p className="text-xs text-[#52525B] dark:text-[#A1A1AA]">
            {ga4Status?.message} Note: First-party backend metrics and GA4 sessions are kept strictly separate and never silently combined.
          </p>
        </div>
      </div>

      {/* KPI Comparison Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiComparisonCard metric={data.kpiComparisons.totalVisitors} />
        <KpiComparisonCard metric={data.kpiComparisons.sessions} />
        <KpiComparisonCard metric={data.kpiComparisons.pageViews} />
        <KpiComparisonCard metric={data.kpiComparisons.successfulOperations} />
      </div>

      {/* Acquisition Channels Table */}
      <div className="bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-[#18181B] dark:text-[#FAFAFA]">
              Source / Medium / Campaign Breakdown
            </h3>
            <p className="text-xs text-[#71717A]">
              Shows traffic sources, sessions, engagement rate, and completed PDF conversions.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#E4E4E7] dark:border-[#3F3F46] text-[#71717A]">
                <th className="py-2.5 pr-4 font-semibold">Source / Medium</th>
                <th className="py-2.5 px-3 font-semibold">Campaign</th>
                <th className="py-2.5 px-3 font-semibold">Users</th>
                <th className="py-2.5 px-3 font-semibold">Sessions</th>
                <th className="py-2.5 px-3 font-semibold">New Users</th>
                <th className="py-2.5 px-3 font-semibold">Engagement Rate</th>
                <th className="py-2.5 px-3 font-semibold">PDF Conversions</th>
                <th className="py-2.5 pl-3 font-semibold">Data Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E4E7] dark:divide-[#27272A]">
              {data.acquisition.map((row) => (
                <tr key={`${row.source}-${row.medium}`}>
                  <td className="py-3 pr-4 font-bold text-[#18181B] dark:text-[#FAFAFA]">
                    {row.source} / {row.medium}
                  </td>
                  <td className="py-3 px-3 font-mono text-[#52525B] dark:text-[#D4D4D8]">
                    {row.campaign}
                  </td>
                  <td className="py-3 px-3 font-mono">{row.users}</td>
                  <td className="py-3 px-3 font-mono">{row.sessions}</td>
                  <td className="py-3 px-3 font-mono">{row.newUsers}</td>
                  <td className="py-3 px-3 font-mono text-[#16865B] dark:text-[#34D399]">
                    {row.engagementRate}%
                  </td>
                  <td className="py-3 px-3 font-mono font-bold">{row.conversions}</td>
                  <td className="py-3 pl-3">
                    <span className="px-2 py-0.5 rounded-md bg-[#F4F4F5] dark:bg-[#27272A] text-[10px] font-mono">
                      {row.dataSource}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function AdminDevicesSection({ data }: { data: EnterpriseBundleData }) {
  const dev = data.devices;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {dev.deviceCategories.map((d) => {
          const Icon =
            d.category === 'Desktop'
              ? Monitor
              : d.category === 'Mobile'
              ? Smartphone
              : Tablet;
          return (
            <div
              key={d.category}
              className="p-5 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4 text-[#B91C1C]" />
                  <span className="text-sm font-bold text-[#18181B] dark:text-[#FAFAFA]">
                    {d.category}
                  </span>
                </div>
                <span className="text-xs font-mono font-bold text-[#B91C1C]">
                  {d.percentage}%
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#F4F4F5] dark:border-[#27272A] text-xs">
                <div>
                  <div className="text-[10px] text-[#71717A]">Users</div>
                  <div className="font-mono font-bold">{d.users}</div>
                </div>
                <div>
                  <div className="text-[10px] text-[#71717A]">Sessions</div>
                  <div className="font-mono font-bold">{d.sessions}</div>
                </div>
                <div>
                  <div className="text-[10px] text-[#71717A]">PDF Failures</div>
                  <div className="font-mono font-bold text-[#D64545]">
                    {d.failedOperations}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl p-6 space-y-4">
          <h3 className="text-sm font-bold text-[#18181B] dark:text-[#FAFAFA]">
            Browser Compatibility & Failure Matrix
          </h3>
          <div className="space-y-3">
            {dev.browsers.map((b) => (
              <div key={b.browser} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold">{b.browser}</span>
                  <span className="font-mono">
                    {b.users} users ({b.percentage}%) · {b.failedJobs} failed ops
                  </span>
                </div>
                <div className="w-full h-2 bg-[#F4F4F5] dark:bg-[#27272A] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#B91C1C] rounded-full"
                    style={{ width: `${Math.max(4, b.percentage)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl p-6 space-y-4">
          <h3 className="text-sm font-bold text-[#18181B] dark:text-[#FAFAFA]">
            Operating System Distribution
          </h3>
          <div className="space-y-3">
            {dev.operatingSystems.map((o) => (
              <div key={o.os} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold">{o.os}</span>
                  <span className="font-mono">
                    {o.users} users ({o.percentage}%)
                  </span>
                </div>
                <div className="w-full h-2 bg-[#F4F4F5] dark:bg-[#27272A] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-slate-700 dark:bg-slate-300 rounded-full"
                    style={{ width: `${Math.max(4, o.percentage)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AdminPdfToolsAnalyticsSection({ data }: { data: EnterpriseBundleData }) {
  const [search, setSearch] = useState('');
  const tools = data.toolsAnalytics.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.slug.toLowerCase().includes(search.toLowerCase()) ||
      t.category.toLowerCase().includes(search.toLowerCase())
  );

  const mostUsed = [...data.toolsAnalytics].sort((a, b) => b.totalAttempts - a.totalAttempts).slice(0, 5);
  const slowest = [...data.toolsAnalytics].sort((a, b) => b.avgProcessingTimeMs - a.avgProcessingTimeMs).slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="p-5 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#B91C1C]">
            Most Used PDF Tools (Verified Backend Operations)
          </h3>
          <div className="space-y-2">
            {mostUsed.map((t, i) => (
              <div key={t.slug} className="flex items-center justify-between text-xs">
                <span>
                  <strong>#{i + 1}</strong> {t.name}
                </span>
                <span className="font-mono font-bold">
                  {t.totalAttempts} ops ({t.successRate}% success)
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="p-5 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
            Highest Processing Duration Tools
          </h3>
          <div className="space-y-2">
            {slowest.map((t, i) => (
              <div key={t.slug} className="flex items-center justify-between text-xs">
                <span>
                  <strong>#{i + 1}</strong> {t.name}
                </span>
                <span className="font-mono font-bold">
                  Avg {t.avgProcessingTimeMs} ms · Median {t.medianProcessingTimeMs} ms
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-[#18181B] dark:text-[#FAFAFA]">
              All 30 PDF Tools Performance Registry
            </h3>
            <p className="text-xs text-[#71717A]">
              Counts only genuine processing executions (never frontend button clicks).
            </p>
          </div>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter 30 PDF tools..."
            className="px-3 py-2 text-xs rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] bg-[#FAFAFA] dark:bg-[#27272A]"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#E4E4E7] dark:border-[#3F3F46] text-[#71717A]">
                <th className="py-2.5 pr-3 font-semibold">PDF Tool</th>
                <th className="py-2.5 px-2 font-semibold">Category</th>
                <th className="py-2.5 px-2 font-semibold">Attempts</th>
                <th className="py-2.5 px-2 font-semibold">Succeeded</th>
                <th className="py-2.5 px-2 font-semibold">Failed</th>
                <th className="py-2.5 px-2 font-semibold">Success %</th>
                <th className="py-2.5 px-2 font-semibold">Avg / Med Time</th>
                <th className="py-2.5 px-2 font-semibold">Volume</th>
                <th className="py-2.5 pl-2 font-semibold">Downloads</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E4E7] dark:divide-[#27272A]">
              {tools.map((t) => (
                <tr key={t.slug}>
                  <td className="py-2.5 pr-3 font-semibold text-[#18181B] dark:text-[#FAFAFA]">
                    {t.name}
                    <div className="text-[10px] font-mono text-[#71717A]">/{t.slug}</div>
                  </td>
                  <td className="py-2.5 px-2">{t.category}</td>
                  <td className="py-2.5 px-2 font-mono font-bold">{t.totalAttempts}</td>
                  <td className="py-2.5 px-2 font-mono text-[#16865B] dark:text-[#34D399]">
                    {t.successfulOperations}
                  </td>
                  <td className="py-2.5 px-2 font-mono text-[#D64545]">{t.failedOperations}</td>
                  <td className="py-2.5 px-2 font-mono font-bold">{t.successRate}%</td>
                  <td className="py-2.5 px-2 font-mono">
                    {t.avgProcessingTimeMs}ms / {t.medianProcessingTimeMs}ms
                  </td>
                  <td className="py-2.5 px-2 font-mono">
                    {formatFileSize(t.totalBytesProcessed)}
                  </td>
                  <td className="py-2.5 pl-2 font-mono">{t.downloadsCompleted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function AdminFunnelSection({ data }: { data: EnterpriseBundleData }) {
  const steps = data.funnels.pdfProcessing;
  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl p-6 space-y-5">
        <div>
          <h3 className="text-base font-bold text-[#18181B] dark:text-[#FAFAFA]">
            End-to-End PDF Processing Conversion Funnel
          </h3>
          <p className="text-xs text-[#71717A]">
            Tracks user progression from landing page visit through tool selection, file upload, engine execution, and final PDF download.
          </p>
        </div>

        <div className="space-y-4">
          {steps.map((s) => (
            <div
              key={s.stepNumber}
              className="p-4 rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] bg-[#FAFAFA] dark:bg-[#27272A]/40 space-y-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="font-bold text-[#18181B] dark:text-[#FAFAFA]">
                  {s.stepName}{' '}
                  <span className="font-mono text-[11px] text-[#71717A]">({s.eventKey})</span>
                </div>
                <div className="flex items-center gap-4 font-mono">
                  <span className="font-bold text-sm">{s.count.toLocaleString()} users/events</span>
                  <span className="px-2 py-0.5 rounded-md bg-[#16865B]/15 text-[#16865B] dark:text-[#34D399] font-bold">
                    {s.conversionFromStartPct}% of start
                  </span>
                  {s.stepNumber > 1 && (
                    <span className="px-2 py-0.5 rounded-md bg-[#D64545]/15 text-[#D64545] font-semibold">
                      -{s.dropOffFromPreviousPct}% drop-off
                    </span>
                  )}
                </div>
              </div>
              <div className="w-full h-3 bg-[#E4E4E7] dark:bg-[#27272A] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#B91C1C] rounded-full transition-all"
                  style={{ width: `${Math.max(5, s.conversionFromStartPct)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AdminErrorMonitoringSection({
  data,
  onUpdateStatus,
}: {
  data: EnterpriseBundleData;
  onUpdateStatus: (signature: string, status: 'Open' | 'Investigating' | 'Resolved') => Promise<void>;
}) {
  const incidents = data.errorMonitoring.incidents;
  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl p-6 space-y-4">
        <div>
          <h3 className="text-base font-bold text-[#18181B] dark:text-[#FAFAFA]">
            Production Error & Dependency Incident Tracker
          </h3>
          <p className="text-xs text-[#71717A]">
            Monitors PDF processing exceptions, Ghostscript / qpdf binary status, and allows administrators to update issue resolution states. Zero passwords or private document contents are ever logged.
          </p>
        </div>

        <div className="space-y-4">
          {incidents.map((inc) => (
            <div
              key={inc.id}
              className="p-4 rounded-2xl border border-[#E4E4E7] dark:border-[#3F3F46] bg-[#FAFAFA] dark:bg-[#27272A]/40 space-y-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-md ${
                        inc.severity === 'Critical'
                          ? 'bg-[#D64545] text-white'
                          : 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {inc.severity}
                    </span>
                    <span className="font-mono text-xs font-bold text-[#18181B] dark:text-[#FAFAFA]">
                      {inc.errorCode}
                    </span>
                  </div>
                  <div className="text-xs text-[#52525B] dark:text-[#A1A1AA]">
                    Tool: <strong>{inc.toolName}</strong> (<code className="font-mono">/{inc.toolSlug}</code>) · Engine: {inc.engine}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    aria-label={`Status for ${inc.signature}`}
                    value={inc.status}
                    onChange={(e) =>
                      onUpdateStatus(
                        inc.signature,
                        e.target.value as 'Open' | 'Investigating' | 'Resolved'
                      )
                    }
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border cursor-pointer ${
                      inc.status === 'Resolved'
                        ? 'bg-[#16865B]/15 border-[#16865B]/40 text-[#16865B] dark:text-[#34D399]'
                        : inc.status === 'Investigating'
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-400'
                        : 'bg-[#D64545]/15 border-[#D64545]/40 text-[#D64545]'
                    }`}
                  >
                    <option value="Open">Open</option>
                    <option value="Investigating">Investigating</option>
                    <option value="Resolved">Resolved</option>
                  </select>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] text-xs text-[#52525B] dark:text-[#D4D4D8]">
                <strong>Resolution / Root Cause Notes:</strong> {inc.resolutionNotes}
              </div>

              <div className="flex flex-wrap items-center gap-4 text-[11px] text-[#71717A] font-mono">
                <span>Occurrences: {inc.occurrences}</span>
                <span>First seen: {new Date(inc.firstOccurrence).toLocaleString()}</span>
                <span>Last seen: {new Date(inc.lastOccurrence).toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AdminRevenueAndGscSection({
  data,
  mode,
}: {
  data: EnterpriseBundleData;
  mode: 'revenue' | 'gsc';
}) {
  const adsense = data.integrations.find((i) => i.service === 'adsense');
  const stripe = data.integrations.find((i) => i.service === 'stripe');
  const gsc = data.integrations.find((i) => i.service === 'gsc');

  if (mode === 'gsc') {
    return (
      <div className="space-y-6">
        <div className="bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-base font-bold text-[#18181B] dark:text-[#FAFAFA]">
                Google Search Console (Official Search Analytics API)
              </h3>
              <p className="text-xs text-[#71717A]">
                Property: <code className="font-mono">{gsc?.propertyOrAccountId}</code> · Search Console clicks are kept strictly separate from GA4 sessions.
              </p>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold ${
                gsc?.configured
                  ? 'bg-[#16865B]/15 text-[#16865B]'
                  : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
              }`}
            >
              {gsc?.configured ? 'Connected' : 'Implemented — Awaiting API Credentials'}
            </span>
          </div>

          <div className="p-4 rounded-xl bg-[#FAFAFA] dark:bg-[#27272A]/50 border border-[#E4E4E7] dark:border-[#3F3F46] text-xs space-y-2">
            <p className="font-semibold text-[#18181B] dark:text-[#FAFAFA]">
              {gsc?.message}
            </p>
            <p className="text-[#71717A]">
              Required Server Environment Variables:{' '}
              {gsc?.requiredEnvVars.map((v) => (
                <code
                  key={v}
                  className="mx-1 px-1.5 py-0.5 rounded bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] font-mono"
                >
                  {v}
                </code>
              ))}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            {['Total Search Clicks', 'Search Impressions', 'Average CTR', 'Average Position'].map(
              (label) => (
                <div
                  key={label}
                  className="p-4 rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] space-y-1"
                >
                  <span className="text-xs text-[#71717A]">{label}</span>
                  <div className="text-lg font-mono font-bold text-[#52525B] dark:text-[#A1A1AA]">
                    {gsc?.configured ? '0' : 'Awaiting API Key'}
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-[#18181B] dark:text-[#FAFAFA]">
              Google AdSense Management API
            </h3>
            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400">
              {adsense?.configured ? 'Connected' : 'Awaiting Credentials'}
            </span>
          </div>
          <p className="text-xs text-[#52525B] dark:text-[#A1A1AA]">{adsense?.message}</p>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46]">
              <div className="text-[#71717A]">Estimated Earnings</div>
              <div className="text-base font-mono font-bold mt-1">
                {adsense?.configured ? '$0.00' : 'Not Configured'}
              </div>
            </div>
            <div className="p-3 rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46]">
              <div className="text-[#71717A]">Page RPM</div>
              <div className="text-base font-mono font-bold mt-1">
                {adsense?.configured ? '$0.00' : 'Not Configured'}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-[#18181B] dark:text-[#FAFAFA]">
              Premium Subscriptions (Stripe Billing)
            </h3>
            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400">
              {stripe?.configured ? 'Connected' : 'Free Tier Active'}
            </span>
          </div>
          <p className="text-xs text-[#52525B] dark:text-[#A1A1AA]">{stripe?.message}</p>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46]">
              <div className="text-[#71717A]">Active Paid Subscribers</div>
              <div className="text-base font-mono font-bold mt-1">0</div>
            </div>
            <div className="p-3 rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46]">
              <div className="text-[#71717A]">Monthly Recurring Revenue</div>
              <div className="text-base font-mono font-bold mt-1">$0.00</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AdminSystemHealthSection({ data }: { data: EnterpriseBundleData }) {
  const h = data.systemHealth;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl space-y-2">
          <div className="flex items-center justify-between text-xs text-[#71717A]">
            <span>CPU Load ({h.cpuCores} Cores)</span>
            <Cpu className="w-4 h-4 text-[#B91C1C]" />
          </div>
          <div className="text-2xl font-bold font-mono">{h.cpuUsagePercent}%</div>
          <div className="text-[11px] font-mono text-[#71717A]">
            Load avg: {h.loadAverage.join(', ')}
          </div>
        </div>

        <div className="p-5 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl space-y-2">
          <div className="flex items-center justify-between text-xs text-[#71717A]">
            <span>Server RAM Usage</span>
            <Server className="w-4 h-4 text-[#B91C1C]" />
          </div>
          <div className="text-2xl font-bold font-mono">{h.ramUsagePercent}%</div>
          <div className="text-[11px] font-mono text-[#71717A]">
            {formatFileSize(h.ramUsedBytes)} / {formatFileSize(h.ramTotalBytes)}
          </div>
        </div>

        <div className="p-5 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl space-y-2">
          <div className="flex items-center justify-between text-xs text-[#71717A]">
            <span>Disk Storage</span>
            <HardDrive className="w-4 h-4 text-[#B91C1C]" />
          </div>
          <div className="text-2xl font-bold font-mono">{h.diskUsagePercent}%</div>
          <div className="text-[11px] font-mono text-[#71717A]">
            {formatFileSize(h.diskFreeBytes)} available
          </div>
        </div>

        <div className="p-5 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl space-y-2">
          <div className="flex items-center justify-between text-xs text-[#71717A]">
            <span>Node Process Uptime</span>
            <Activity className="w-4 h-4 text-[#16865B]" />
          </div>
          <div className="text-2xl font-bold font-mono">
            {Math.floor(h.appUptimeSeconds / 60)}m {h.appUptimeSeconds % 60}s
          </div>
          <div className="text-[11px] font-mono text-[#71717A]">
            Heap: {formatFileSize(h.processHeapUsedBytes)}
          </div>
        </div>
      </div>

      {/* PDF Processing Dependency Verification */}
      <div className="bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl p-6 space-y-4">
        <h3 className="text-sm font-bold text-[#18181B] dark:text-[#FAFAFA]">
          PDF Processing Native Binary Engines (Ubuntu Host Diagnostics)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="p-4 rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] space-y-1">
            <div className="flex items-center justify-between font-bold">
              <span>qpdf (256-bit AES Encryption)</span>
              <span
                className={
                  h.pdfDependencies.qpdfInstalled ? 'text-[#16865B]' : 'text-[#D64545]'
                }
              >
                {h.pdfDependencies.qpdfInstalled ? 'Operational' : 'Missing'}
              </span>
            </div>
            <div className="font-mono text-[11px] text-[#71717A]">
              Path: {h.pdfDependencies.qpdfPath || 'Not found'}
            </div>
          </div>

          <div className="p-4 rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] space-y-1">
            <div className="flex items-center justify-between font-bold">
              <span>Ghostscript (Compression & PDF/X)</span>
              <span
                className={
                  h.pdfDependencies.ghostscriptInstalled
                    ? 'text-[#16865B]'
                    : 'text-[#D64545]'
                }
              >
                {h.pdfDependencies.ghostscriptInstalled ? 'Operational' : 'Missing'}
              </span>
            </div>
            <div className="font-mono text-[11px] text-[#71717A]">
              Path: {h.pdfDependencies.ghostscriptPath || 'Not found'}
            </div>
          </div>

          <div className="p-4 rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] space-y-1">
            <div className="flex items-center justify-between font-bold">
              <span>Poppler Utilities (pdftoppm)</span>
              <span
                className={
                  h.pdfDependencies.popplerInstalled ? 'text-[#16865B]' : 'text-[#D64545]'
                }
              >
                {h.pdfDependencies.popplerInstalled ? 'Operational' : 'Missing'}
              </span>
            </div>
            <div className="font-mono text-[11px] text-[#71717A]">
              Path: {h.pdfDependencies.popplerPath || 'Not found'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AdminReportsAndExportsSection({ data }: { data: EnterpriseBundleData }) {
  const downloadCsv = (filename: string, rows: string[][]) => {
    const csvContent = rows
      .map((r) =>
        r.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')
      )
      .join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleExportToolsCsv = () => {
    const header = [
      'Tool Slug',
      'Tool Name',
      'Category',
      'Total Attempts',
      'Successful Operations',
      'Failed Operations',
      'Success Rate (%)',
      'Avg Processing Time (ms)',
      'Median Processing Time (ms)',
      'Total Bytes Processed',
      'Downloads Completed',
    ];
    const rows = data.toolsAnalytics.map((t) => [
      t.slug,
      t.name,
      t.category,
      String(t.totalAttempts),
      String(t.successfulOperations),
      String(t.failedOperations),
      String(t.successRate),
      String(t.avgProcessingTimeMs),
      String(t.medianProcessingTimeMs),
      String(t.totalBytesProcessed),
      String(t.downloadsCompleted),
    ]);
    downloadCsv(`pdfnestly-tools-report-${data.range}.csv`, [header, ...rows]);
  };

  const handleExportKpiCsv = () => {
    const header = [
      'Metric',
      'Current Period Value',
      'Previous Period Value',
      'Percent Change (%)',
      'Data Source',
      'Last Updated',
    ];
    const rows = Object.values(data.kpiComparisons).map((m) => [
      m.label,
      String(m.currentValue),
      String(m.previousValue),
      String(m.percentChange),
      m.source,
      m.lastUpdated,
    ]);
    downloadCsv(`pdfnestly-kpi-summary-${data.range}.csv`, [header, ...rows]);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl p-6 space-y-4">
        <h3 className="text-base font-bold text-[#18181B] dark:text-[#FAFAFA]">
          Downloadable Analytics Reports & CSV Exports
        </h3>
        <p className="text-xs text-[#71717A]">
          All exported CSV spreadsheets automatically respect your active date range ({data.rangeLabel}) and global filters.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div className="p-4 rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] flex items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="text-sm font-bold text-[#18181B] dark:text-[#FAFAFA]">
                PDF Tools Performance Report (CSV)
              </div>
              <p className="text-xs text-[#71717A]">
                All 30 tools with attempts, completions, failures, avg/median duration, and byte volume.
              </p>
            </div>
            <button
              type="button"
              onClick={handleExportToolsCsv}
              className="px-4 py-2 rounded-xl bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>

          <div className="p-4 rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] flex items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="text-sm font-bold text-[#18181B] dark:text-[#FAFAFA]">
                Executive KPI Period Comparison (CSV)
              </div>
              <p className="text-xs text-[#71717A]">
                Traffic, application, and registration KPIs with previous-period deltas.
              </p>
            </div>
            <button
              type="button"
              onClick={handleExportKpiCsv}
              className="px-4 py-2 rounded-xl bg-[#18181B] dark:bg-[#FAFAFA] text-white dark:text-[#18181B] text-xs font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
