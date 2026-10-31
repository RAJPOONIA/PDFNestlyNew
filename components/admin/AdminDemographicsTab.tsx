'use client';

import React, { useState } from 'react';
import {
  Globe,
  Calendar,
  Users,
  Activity,
  FileText,
  TrendingUp,
  Search,
  RefreshCw,
  ArrowUpRight,
  Filter,
} from 'lucide-react';
import { AnalyticsTimeRange } from '@/lib/platform-store';

export interface CountryDemographicItem {
  country: string;
  countryCode: string;
  flagEmoji: string;
  visitorCount: number;
  percentage: number;
  eventsCount: number;
  activeUsersCount: number;
}

export interface DetailedAnalyticsData {
  range: string;
  startDate: string;
  endDate: string;
  users: {
    total: number;
    active: number;
    newInPeriod: number;
    admins: number;
    suspended: number;
    byProvider: { google: number; email: number };
  };
  jobs: {
    total: number;
    succeeded: number;
    failed: number;
    successRate: number;
    totalBytesProcessed: number;
  };
  totalEventsInPeriod: number;
  countryDemographics: CountryDemographicItem[];
  timeSeries: Array<{
    key: string;
    label: string;
    visitors: number;
    pdfJobs: number;
    signups: number;
  }>;
  recentSignups: Array<{
    uid: string;
    email: string;
    displayName: string;
    provider: string;
    role: string;
    status: string;
    country: string;
    countryCode?: string;
    createdAt: string;
  }>;
}

interface AdminDemographicsTabProps {
  analytics: DetailedAnalyticsData | null;
  selectedRange: AnalyticsTimeRange;
  onRangeChange: (range: AnalyticsTimeRange) => void;
  customStartDate: string;
  customEndDate: string;
  onCustomDateChange: (start: string, end: string) => void;
  isLoading: boolean;
  onRefresh: () => void;
}

export function AdminDemographicsTab({
  analytics,
  selectedRange,
  onRangeChange,
  customStartDate,
  customEndDate,
  onCustomDateChange,
  isLoading,
  onRefresh,
}: AdminDemographicsTabProps) {
  const [countrySearch, setCountrySearch] = useState('');
  const [localStart, setLocalStart] = useState(customStartDate);
  const [localEnd, setLocalEnd] = useState(customEndDate);

  const demographics = analytics?.countryDemographics || [];

  const filteredDemographics = demographics.filter((d) => {
    if (!countrySearch.trim()) return true;
    const q = countrySearch.toLowerCase();
    return (
      d.country.toLowerCase().includes(q) ||
      d.countryCode.toLowerCase().includes(q)
    );
  });

  const totalVisitors = demographics.reduce((sum, d) => sum + d.visitorCount, 0);
  const topCountry = demographics.length > 0 ? demographics[0] : null;

  const handleApplyCustomDate = () => {
    if (localStart && localEnd) {
      onCustomDateChange(localStart, localEnd);
      onRangeChange('custom');
    }
  };

  return (
    <div className="space-y-6">
      {/* Time Range Selector Bar */}
      <div className="bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl p-5 shadow-2xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-[#B91C1C]" />
              <h2 className="text-base font-bold text-[#18181B] dark:text-[#FAFAFA]">
                Audience Demographics & Global Traffic Insights
              </h2>
            </div>
            <p className="text-xs text-[#71717A]">
              Filter geographic visitor distribution, active users, signups, and PDF activity across multiple time ranges.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] bg-[#FAFAFA] dark:bg-[#27272A] hover:border-[#B91C1C] text-xs font-semibold cursor-pointer shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#B91C1C]' : ''}`} />
              <span>Refresh Metrics</span>
            </button>
          </div>
        </div>

        {/* Range Buttons */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-[#E4E4E7] dark:border-[#3F3F46]">
          {[
            { id: 'today', label: 'Today (24h)' },
            { id: '7d', label: 'Last 7 Days' },
            { id: '28d', label: 'Last 28 Days' },
            { id: '90d', label: 'Last 90 Days' },
            { id: 'lifetime', label: 'Lifetime / All-Time' },
            { id: 'custom', label: 'Custom Date Range' },
          ].map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => onRangeChange(r.id as AnalyticsTimeRange)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
                selectedRange === r.id
                  ? 'bg-[#B91C1C] text-white shadow-xs'
                  : 'bg-[#F4F4F5] dark:bg-[#27272A] text-[#52525B] dark:text-[#D4D4D8] hover:text-[#18181B] dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {r.label}
            </button>
          ))}

          {selectedRange === 'custom' && (
            <div className="flex flex-wrap items-center gap-2 ml-auto">
              <input
                type="date"
                value={localStart}
                onChange={(e) => setLocalStart(e.target.value)}
                className="px-2.5 py-1 text-xs rounded-lg border border-[#E4E4E7] dark:border-[#3F3F46] bg-white dark:bg-[#27272A] text-[#18181B] dark:text-[#FAFAFA]"
              />
              <span className="text-xs text-[#71717A]">to</span>
              <input
                type="date"
                value={localEnd}
                onChange={(e) => setLocalEnd(e.target.value)}
                className="px-2.5 py-1 text-xs rounded-lg border border-[#E4E4E7] dark:border-[#3F3F46] bg-white dark:bg-[#27272A] text-[#18181B] dark:text-[#FAFAFA]"
              />
              <button
                type="button"
                onClick={handleApplyCustomDate}
                className="px-3 py-1 rounded-lg bg-[#18181B] dark:bg-[#FAFAFA] text-white dark:text-[#18181B] text-xs font-semibold cursor-pointer"
              >
                Apply Range
              </button>
            </div>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl space-y-1">
          <div className="text-xs font-semibold text-[#71717A] flex items-center justify-between">
            <span>Period Visitors</span>
            <Users className="w-4 h-4 text-[#B91C1C]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[#18181B] dark:text-[#FAFAFA]">
            {totalVisitors.toLocaleString()}
          </div>
          <p className="text-[11px] text-[#52525B] dark:text-[#A1A1AA]">
            Across {demographics.length} geographic countries
          </p>
        </div>

        <div className="p-5 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl space-y-1">
          <div className="text-xs font-semibold text-[#71717A] flex items-center justify-between">
            <span>Period Signups</span>
            <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
            +{analytics?.users.newInPeriod ?? 0}
          </div>
          <p className="text-[11px] text-[#52525B] dark:text-[#A1A1AA]">
            {analytics?.users.byProvider.google ?? 0} Google · {analytics?.users.byProvider.email ?? 0} Email
          </p>
        </div>

        <div className="p-5 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl space-y-1">
          <div className="text-xs font-semibold text-[#71717A] flex items-center justify-between">
            <span>PDF Operations</span>
            <FileText className="w-4 h-4 text-sky-600 dark:text-sky-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-[#18181B] dark:text-[#FAFAFA]">
            {analytics?.jobs.total ?? 0}
          </div>
          <p className="text-[11px] text-[#52525B] dark:text-[#A1A1AA]">
            {analytics?.jobs.successRate ?? 100}% execution success rate
          </p>
        </div>

        <div className="p-5 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl space-y-1">
          <div className="text-xs font-semibold text-[#71717A] flex items-center justify-between">
            <span>Leading Country</span>
            <Globe className="w-4 h-4 text-[#B91C1C]" />
          </div>
          <div className="text-xl font-bold text-[#18181B] dark:text-[#FAFAFA] flex items-center gap-1.5 truncate">
            {topCountry ? (
              <>
                <span className="text-2xl">{topCountry.flagEmoji}</span>
                <span className="truncate">{topCountry.country}</span>
              </>
            ) : (
              'Global'
            )}
          </div>
          <p className="text-[11px] text-[#52525B] dark:text-[#A1A1AA]">
            {topCountry ? `${topCountry.percentage}% of overall audience` : 'No data yet'}
          </p>
        </div>
      </div>

      {/* Country Breakdown Table & Visual Bar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl p-6 space-y-4 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-[#18181B] dark:text-[#FAFAFA]">
                Country Demographics Breakdown
              </h3>
              <p className="text-xs text-[#71717A]">
                Ranked by visitor volume, session frequency, and PDF actions
              </p>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-[#71717A] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={countrySearch}
                onChange={(e) => setCountrySearch(e.target.value)}
                placeholder="Search country..."
                className="w-full pl-8 pr-3 py-1 text-xs rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] bg-[#FAFAFA] dark:bg-[#27272A] text-[#18181B] dark:text-[#FAFAFA]"
              />
            </div>
          </div>

          <div className="overflow-x-auto border border-[#E4E4E7] dark:border-[#3F3F46] rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FAFAFA] dark:bg-[#27272A] border-b border-[#E4E4E7] dark:border-[#3F3F46] text-[#71717A] dark:text-[#A1A1AA] uppercase tracking-wider font-semibold text-[10px]">
                <tr>
                  <th className="py-2.5 px-4">Country</th>
                  <th className="py-2.5 px-3">Code</th>
                  <th className="py-2.5 px-3 font-mono">Visitors</th>
                  <th className="py-2.5 px-3">Share %</th>
                  <th className="py-2.5 px-3">Active Sessions</th>
                  <th className="py-2.5 px-4 font-mono text-right">PDF Events</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E4E7] dark:divide-[#3F3F46]">
                {filteredDemographics.map((item) => (
                  <tr key={item.countryCode} className="hover:bg-[#FAFAFA] dark:hover:bg-[#27272A]/50">
                    <td className="py-3 px-4 font-semibold text-[#18181B] dark:text-[#FAFAFA] flex items-center gap-2">
                      <span className="text-lg">{item.flagEmoji}</span>
                      <span>{item.country}</span>
                    </td>
                    <td className="py-3 px-3 font-mono text-[#71717A] uppercase text-[11px]">
                      {item.countryCode}
                    </td>
                    <td className="py-3 px-3 font-mono font-bold text-[#18181B] dark:text-[#FAFAFA]">
                      {item.visitorCount.toLocaleString()}
                    </td>
                    <td className="py-3 px-3 min-w-[130px]">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px] font-mono">
                          <span className="font-semibold text-[#18181B] dark:text-[#FAFAFA]">
                            {item.percentage}%
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-[#F4F4F5] dark:bg-[#27272A] rounded-full overflow-hidden">
                          <div
                            style={{ width: `${Math.max(3, item.percentage)}%` }}
                            className="bg-[#B91C1C] h-full rounded-full"
                          />
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3 font-mono text-[#52525B] dark:text-[#D4D4D8]">
                      {item.activeUsersCount}
                    </td>
                    <td className="py-3 px-4 font-mono text-right font-semibold text-[#18181B] dark:text-[#FAFAFA]">
                      {item.eventsCount.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Time Series Trend in Period */}
        <div className="lg:col-span-4 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl p-6 space-y-4 shadow-2xs">
          <div>
            <h3 className="text-sm font-bold text-[#18181B] dark:text-[#FAFAFA]">
              Period Activity Trend
            </h3>
            <p className="text-xs text-[#71717A]">
              Daily traffic and PDF operations
            </p>
          </div>

          <div className="space-y-3 pt-2">
            {(analytics?.timeSeries || []).slice(-7).map((point) => {
              const maxVal = Math.max(
                1,
                ...((analytics?.timeSeries || []).map((p) => Math.max(p.visitors, p.pdfJobs, p.signups)))
              );
              const visitorWidth = Math.round((point.visitors / maxVal) * 100);
              const jobWidth = Math.round((point.pdfJobs / maxVal) * 100);

              return (
                <div key={point.key} className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-mono font-medium text-[#18181B] dark:text-[#FAFAFA]">
                      {point.label}
                    </span>
                    <span className="font-mono text-[#71717A]">
                      {point.visitors} visitors · {point.pdfJobs} jobs
                    </span>
                  </div>
                  <div className="h-2 w-full bg-[#F4F4F5] dark:bg-[#27272A] rounded-full overflow-hidden flex gap-0.5">
                    <div
                      style={{ width: `${Math.max(2, visitorWidth)}%` }}
                      className="bg-[#B91C1C] h-full"
                      title={`${point.visitors} visitors`}
                    />
                    <div
                      style={{ width: `${Math.max(2, jobWidth)}%` }}
                      className="bg-emerald-600 h-full"
                      title={`${point.pdfJobs} PDF jobs`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* User Signups with Origin Countries */}
      <div className="bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl p-6 shadow-2xs space-y-4">
        <div>
          <h3 className="text-sm font-bold text-[#18181B] dark:text-[#FAFAFA]">
            User Accounts & Registration Geographics ({analytics?.recentSignups.length || 0})
          </h3>
          <p className="text-xs text-[#71717A]">
            Registered email addresses, authentication providers, and country of origin detected on signup
          </p>
        </div>

        <div className="overflow-x-auto border border-[#E4E4E7] dark:border-[#3F3F46] rounded-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#FAFAFA] dark:bg-[#27272A] border-b border-[#E4E4E7] dark:border-[#3F3F46] text-[#71717A] dark:text-[#A1A1AA] uppercase tracking-wider font-semibold text-[10px]">
              <tr>
                <th className="py-2.5 px-4">User Email & Name</th>
                <th className="py-2.5 px-3">Provider</th>
                <th className="py-2.5 px-3">Country of Origin</th>
                <th className="py-2.5 px-3">Role</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-4 text-right">Registration Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E4E7] dark:divide-[#3F3F46]">
              {(analytics?.recentSignups || []).map((u) => (
                <tr key={u.uid} className="hover:bg-[#FAFAFA] dark:hover:bg-[#27272A]/50">
                  <td className="py-3 px-4">
                    <div className="font-semibold text-[#18181B] dark:text-[#FAFAFA]">
                      {u.displayName || u.email.split('@')[0]}
                    </div>
                    <div className="font-mono text-[11px] text-[#71717A]">{u.email}</div>
                  </td>
                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 rounded-md bg-[#F4F4F5] dark:bg-[#27272A] capitalize font-medium">
                      {u.provider}
                    </span>
                  </td>
                  <td className="py-3 px-3 font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      <span>🌐</span>
                      <span>{u.country || 'Global'}</span>
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    <span
                      className={`px-2 py-0.5 rounded-md font-bold text-[10px] uppercase ${
                        u.role === 'admin'
                          ? 'bg-[#FEF2F2] dark:bg-[#B91C1C]/20 text-[#B91C1C] dark:text-rose-400'
                          : 'bg-[#F4F4F5] dark:bg-[#27272A] text-[#52525B]'
                      }`}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    <span
                      className={`px-2 py-0.5 rounded-md font-semibold text-[11px] capitalize ${
                        u.status === 'active'
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {u.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right text-[11px] text-[#71717A] whitespace-nowrap">
                    {new Date(u.createdAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
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
