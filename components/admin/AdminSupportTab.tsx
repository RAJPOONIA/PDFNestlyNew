'use client';

import React, { useState } from 'react';
import {
  MessageSquare,
  Search,
  RefreshCw,
  Send,
  CheckCircle2,
  Clock,
  AlertCircle,
  Mail,
  User,
  Globe,
  Tag,
  ArrowRight,
  X,
  Shield,
  CornerDownRight,
} from 'lucide-react';

export interface SupportReplyItem {
  id: string;
  senderName: string;
  senderEmail: string;
  message: string;
  createdAt: string;
}

export interface SupportTicketItem {
  id: string;
  name: string;
  email: string;
  topic: string;
  message: string;
  status: 'open' | 'in_progress' | 'resolved';
  ip?: string;
  country?: string;
  countryCode?: string;
  createdAt: string;
  updatedAt: string;
  replies: SupportReplyItem[];
}

export interface SupportStats {
  total: number;
  open: number;
  inProgress: number;
  resolved: number;
}

interface AdminSupportTabProps {
  tickets: SupportTicketItem[];
  stats: SupportStats;
  isLoading: boolean;
  onRefresh: () => void;
  onReplySuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

export function AdminSupportTab({
  tickets,
  stats,
  isLoading,
  onRefresh,
  onReplySuccess,
  onError,
}: AdminSupportTabProps) {
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTicket, setSelectedTicket] = useState<SupportTicketItem | null>(null);

  // Reply form state
  const [replyMessage, setReplyMessage] = useState('');
  const [replyStatus, setReplyStatus] = useState<'in_progress' | 'resolved'>('in_progress');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // Filtered tickets
  const filteredTickets = tickets.filter((t) => {
    if (filterStatus !== 'all' && t.status !== filterStatus) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchId = t.id.toLowerCase().includes(q);
      const matchName = t.name.toLowerCase().includes(q);
      const matchEmail = t.email.toLowerCase().includes(q);
      const matchTopic = t.topic.toLowerCase().includes(q);
      const matchMsg = t.message.toLowerCase().includes(q);
      const matchCountry = (t.country || '').toLowerCase().includes(q);
      return matchId || matchName || matchEmail || matchTopic || matchMsg || matchCountry;
    }
    return true;
  });

  const handleSendReply = async () => {
    if (!selectedTicket) return;
    if (!replyMessage.trim()) {
      onError('Please enter a response message before sending.');
      return;
    }

    setIsSendingReply(true);
    try {
      const res = await fetch('/api/admin/support/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId: selectedTicket.id,
          message: replyMessage.trim(),
          newStatus: replyStatus,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to dispatch email reply.');
      }

      setReplyMessage('');
      if (data.ticket) {
        setSelectedTicket(data.ticket);
      }
      onReplySuccess(
        `Official reply sent to ${selectedTicket.email} from support@pdfnestly.com.`
      );
      onRefresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Error sending reply.');
    } finally {
      setIsSendingReply(false);
    }
  };

  const handleQuickStatusChange = async (
    ticketId: string,
    newStatus: 'open' | 'in_progress' | 'resolved'
  ) => {
    setIsUpdatingStatus(true);
    try {
      const res = await fetch('/api/admin/support/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId, status: newStatus }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update ticket status.');
      }

      if (selectedTicket && selectedTicket.id === ticketId && data.ticket) {
        setSelectedTicket(data.ticket);
      }
      onReplySuccess(`Ticket #${ticketId} status updated to ${newStatus}.`);
      onRefresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Error updating status.');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Support Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl space-y-1">
          <div className="text-xs font-semibold text-[#71717A] flex items-center justify-between">
            <span>Total Inquiries</span>
            <MessageSquare className="w-4 h-4 text-[#B91C1C]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[#18181B] dark:text-[#FAFAFA]">
            {stats.total}
          </div>
          <p className="text-[11px] text-[#52525B] dark:text-[#A1A1AA]">
            All user feedback & technical inquiries
          </p>
        </div>

        <div className="p-5 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl space-y-1">
          <div className="text-xs font-semibold text-[#71717A] flex items-center justify-between">
            <span>Open & Unassigned</span>
            <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-rose-600 dark:text-rose-400">
            {stats.open}
          </div>
          <p className="text-[11px] text-[#52525B] dark:text-[#A1A1AA]">
            Awaiting administrator response
          </p>
        </div>

        <div className="p-5 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl space-y-1">
          <div className="text-xs font-semibold text-[#71717A] flex items-center justify-between">
            <span>In Progress</span>
            <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400">
            {stats.inProgress}
          </div>
          <p className="text-[11px] text-[#52525B] dark:text-[#A1A1AA]">
            Actively being investigated or replied
          </p>
        </div>

        <div className="p-5 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl space-y-1">
          <div className="text-xs font-semibold text-[#71717A] flex items-center justify-between">
            <span>Resolved</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
            {stats.resolved}
          </div>
          <p className="text-[11px] text-[#52525B] dark:text-[#A1A1AA]">
            Completed & solution provided
          </p>
        </div>
      </div>

      {/* Main Container */}
      <div className="bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl p-6 shadow-2xs space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-[#18181B] dark:text-[#FAFAFA]">
                User Support Inquiries & Feedback Tickets
              </h2>
              <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-[#B91C1C]/10 text-[#B91C1C] dark:text-rose-400">
                Dispatches from support@pdfnestly.com
              </span>
            </div>
            <p className="text-xs text-[#71717A] mt-0.5">
              Review user questions, technical bug reports, and feedback. Reply directly from the admin panel to dispatch branded emails to customers.
            </p>
          </div>

          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] bg-[#FAFAFA] dark:bg-[#27272A] hover:border-[#B91C1C] text-xs font-semibold cursor-pointer shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#B91C1C]' : ''}`} />
            <span>Refresh Tickets</span>
          </button>
        </div>

        {/* Filter and Search Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
          {/* Status filter pills */}
          <div className="flex items-center gap-1 bg-[#F4F4F5] dark:bg-[#27272A] p-1 rounded-xl">
            {[
              { id: 'all', label: `All (${stats.total})` },
              { id: 'open', label: `Open (${stats.open})` },
              { id: 'in_progress', label: `In Progress (${stats.inProgress})` },
              { id: 'resolved', label: `Resolved (${stats.resolved})` },
            ].map((pill) => (
              <button
                key={pill.id}
                type="button"
                onClick={() => setFilterStatus(pill.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  filterStatus === pill.id
                    ? 'bg-white dark:bg-[#18181B] text-[#B91C1C] dark:text-rose-400 shadow-xs'
                    : 'text-[#71717A] dark:text-[#A1A1AA] hover:text-[#18181B] dark:hover:text-white'
                }`}
              >
                {pill.label}
              </button>
            ))}
          </div>

          {/* Search box */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-3.5 h-3.5 text-[#71717A] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by ticket ID, name, email, country, topic..."
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] bg-[#FAFAFA] dark:bg-[#27272A] text-[#18181B] dark:text-[#FAFAFA] placeholder:text-[#A1A1AA] focus:outline-none focus:ring-2 focus:ring-[#B91C1C]"
            />
          </div>
        </div>

        {/* Tickets Table / List */}
        {filteredTickets.length === 0 ? (
          <div className="p-12 text-center border border-dashed border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl space-y-2">
            <MessageSquare className="w-8 h-8 text-[#A1A1AA] mx-auto" />
            <p className="text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA]">
              No support tickets found matching the filter criteria.
            </p>
            <p className="text-[11px] text-[#71717A]">
              When visitors use the contact form, their inquiries appear here in real time.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto border border-[#E4E4E7] dark:border-[#3F3F46] rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FAFAFA] dark:bg-[#27272A] border-b border-[#E4E4E7] dark:border-[#3F3F46] text-[#71717A] dark:text-[#A1A1AA] uppercase tracking-wider font-semibold text-[10px]">
                <tr>
                  <th className="py-3 px-4">Ticket</th>
                  <th className="py-3 px-3">Customer & Country</th>
                  <th className="py-3 px-3">Topic</th>
                  <th className="py-3 px-3">Message Excerpt</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E4E7] dark:divide-[#3F3F46]">
                {filteredTickets.map((ticket) => {
                  const replyCount = ticket.replies ? ticket.replies.length : 0;
                  return (
                    <tr
                      key={ticket.id}
                      className="hover:bg-[#FAFAFA] dark:hover:bg-[#27272A]/50 transition-colors"
                    >
                      <td className="py-3.5 px-4 font-mono font-bold text-[#18181B] dark:text-[#FAFAFA]">
                        <div className="flex items-center gap-1.5">
                          <span>#{ticket.id}</span>
                          {replyCount > 0 && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] bg-sky-500/10 text-sky-600 dark:text-sky-400 font-semibold" title={`${replyCount} admin reply sent`}>
                              {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-3">
                        <div className="font-semibold text-[#18181B] dark:text-[#FAFAFA]">
                          {ticket.name}
                        </div>
                        <div className="text-[11px] text-[#71717A] flex items-center gap-1">
                          <span>{ticket.email}</span>
                          {ticket.country && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-500 font-medium">
                              · 🌐 {ticket.country}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-3">
                        <span className="px-2 py-0.5 rounded-md bg-[#F4F4F5] dark:bg-[#27272A] text-[#18181B] dark:text-[#FAFAFA] font-medium text-[11px]">
                          {ticket.topic}
                        </span>
                      </td>

                      <td className="py-3.5 px-3 max-w-xs">
                        <p className="truncate text-[#52525B] dark:text-[#D4D4D8] text-[11px]">
                          {ticket.message}
                        </p>
                      </td>

                      <td className="py-3.5 px-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold text-[11px] capitalize ${
                            ticket.status === 'open'
                              ? 'bg-rose-500/15 text-rose-700 dark:text-rose-400'
                              : ticket.status === 'in_progress'
                              ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                              : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                          }`}
                        >
                          {ticket.status === 'open' && <AlertCircle className="w-3 h-3" />}
                          {ticket.status === 'in_progress' && <Clock className="w-3 h-3" />}
                          {ticket.status === 'resolved' && <CheckCircle2 className="w-3 h-3" />}
                          {ticket.status === 'in_progress' ? 'In Progress' : ticket.status}
                        </span>
                      </td>

                      <td className="py-3.5 px-3 text-[11px] text-[#71717A] whitespace-nowrap">
                        {new Date(ticket.createdAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedTicket(ticket)}
                          className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-[#B91C1C] hover:bg-[#7F1D1D] text-white text-xs font-semibold cursor-pointer transition-colors shadow-2xs"
                        >
                          <span>Manage & Reply</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Ticket Details & Reply Modal Drawer */}
      {selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="p-5 border-b border-[#E4E4E7] dark:border-[#3F3F46] flex items-center justify-between gap-4 bg-[#FAFAFA] dark:bg-[#27272A]/50">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-base text-[#18181B] dark:text-[#FAFAFA]">
                    Ticket #{selectedTicket.id}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold text-[10px] uppercase ${
                      selectedTicket.status === 'open'
                        ? 'bg-rose-500/15 text-rose-700 dark:text-rose-400'
                        : selectedTicket.status === 'in_progress'
                        ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                        : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                    }`}
                  >
                    {selectedTicket.status}
                  </span>
                </div>
                <p className="text-xs text-[#71717A]">
                  Topic: <strong>{selectedTicket.topic}</strong> · Submitted{' '}
                  {new Date(selectedTicket.createdAt).toLocaleString()}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedTicket(null)}
                aria-label="Close modal"
                className="p-1.5 rounded-lg text-[#71717A] hover:bg-[#F4F4F5] dark:hover:bg-[#27272A] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1 text-xs">
              {/* Customer Metadata Card */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3.5 bg-[#F4F4F5] dark:bg-[#27272A] rounded-xl">
                <div>
                  <span className="text-[10px] text-[#71717A] uppercase font-bold block">Customer Name</span>
                  <span className="font-semibold text-[#18181B] dark:text-[#FAFAFA]">{selectedTicket.name}</span>
                </div>
                <div>
                  <span className="text-[10px] text-[#71717A] uppercase font-bold block">User Email</span>
                  <span className="font-semibold text-[#18181B] dark:text-[#FAFAFA]">{selectedTicket.email}</span>
                </div>
                <div>
                  <span className="text-[10px] text-[#71717A] uppercase font-bold block">Country / IP</span>
                  <span className="font-semibold text-[#18181B] dark:text-[#FAFAFA]">
                    {selectedTicket.country ? `🌐 ${selectedTicket.country}` : 'Global'}
                    {selectedTicket.ip ? ` (${selectedTicket.ip})` : ''}
                  </span>
                </div>
              </div>

              {/* Original User Message */}
              <div className="space-y-1.5">
                <span className="font-bold text-[11px] text-[#71717A] uppercase tracking-wider block">
                  Original Inquiry Message:
                </span>
                <div className="p-4 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl leading-relaxed text-[#18181B] dark:text-[#FAFAFA] whitespace-pre-wrap">
                  {selectedTicket.message}
                </div>
              </div>

              {/* Correspondence Thread / Previous Replies */}
              {selectedTicket.replies && selectedTicket.replies.length > 0 && (
                <div className="space-y-3 pt-2">
                  <span className="font-bold text-[11px] text-[#71717A] uppercase tracking-wider flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-[#B91C1C]" />
                    <span>Official Reply History ({selectedTicket.replies.length})</span>
                  </span>
                  <div className="space-y-3">
                    {selectedTicket.replies.map((reply) => (
                      <div
                        key={reply.id}
                        className="p-3.5 bg-rose-50/40 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 rounded-xl space-y-1.5"
                      >
                        <div className="flex items-center justify-between text-[11px]">
                          <div className="flex items-center gap-1.5 font-semibold text-[#B91C1C] dark:text-rose-400">
                            <Shield className="w-3.5 h-3.5" />
                            <span>{reply.senderName} ({reply.senderEmail})</span>
                          </div>
                          <span className="text-[#71717A] font-mono text-[10px]">
                            {new Date(reply.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-xs text-[#18181B] dark:text-[#FAFAFA] leading-relaxed whitespace-pre-wrap">
                          {reply.message}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Status Quick Actions */}
              <div className="flex items-center justify-between pt-2 border-t border-[#E4E4E7] dark:border-[#3F3F46]">
                <span className="font-bold text-[#71717A] text-[11px] uppercase">
                  Change Ticket Status:
                </span>
                <div className="flex items-center gap-2">
                  {selectedTicket.status !== 'open' && (
                    <button
                      type="button"
                      disabled={isUpdatingStatus}
                      onClick={() => handleQuickStatusChange(selectedTicket.id, 'open')}
                      className="px-2.5 py-1 rounded-lg border border-[#E4E4E7] dark:border-[#3F3F46] hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-semibold cursor-pointer"
                    >
                      Set to Open
                    </button>
                  )}
                  {selectedTicket.status !== 'in_progress' && (
                    <button
                      type="button"
                      disabled={isUpdatingStatus}
                      onClick={() => handleQuickStatusChange(selectedTicket.id, 'in_progress')}
                      className="px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-400 text-[11px] font-semibold cursor-pointer"
                    >
                      Set to In Progress
                    </button>
                  )}
                  {selectedTicket.status !== 'resolved' && (
                    <button
                      type="button"
                      disabled={isUpdatingStatus}
                      onClick={() => handleQuickStatusChange(selectedTicket.id, 'resolved')}
                      className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 text-[11px] font-semibold cursor-pointer"
                    >
                      Mark as Resolved
                    </button>
                  )}
                </div>
              </div>

              {/* Reply Form */}
              <div className="p-4 bg-slate-50 dark:bg-[#27272A]/40 border border-[#E4E4E7] dark:border-[#3F3F46] rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-[#18181B] dark:text-[#FAFAFA] flex items-center gap-1.5">
                    <Send className="w-3.5 h-3.5 text-[#B91C1C]" />
                    <span>Send Official Email Reply</span>
                  </span>
                  <span className="text-[10px] text-[#71717A]">
                    From: <strong className="text-[#18181B] dark:text-[#FAFAFA]">support@pdfnestly.com</strong>
                  </span>
                </div>

                <textarea
                  rows={4}
                  value={replyMessage}
                  onChange={(e) => setReplyMessage(e.target.value)}
                  placeholder={`Write your response to ${selectedTicket.name} here... This will be sent as an official PDFNestly email.`}
                  className="w-full p-3 text-xs bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#B91C1C] text-[#18181B] dark:text-[#FAFAFA] placeholder:text-[#A1A1AA]"
                />

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-[#71717A]">Update status on send:</span>
                    <select
                      value={replyStatus}
                      onChange={(e) => setReplyStatus(e.target.value as any)}
                      className="px-2.5 py-1 text-xs rounded-lg border border-[#E4E4E7] dark:border-[#3F3F46] bg-white dark:bg-[#18181B] text-[#18181B] dark:text-[#FAFAFA]"
                    >
                      <option value="in_progress">Keep In Progress</option>
                      <option value="resolved">Mark as Resolved</option>
                    </select>
                  </div>

                  <button
                    type="button"
                    disabled={isSendingReply || !replyMessage.trim()}
                    onClick={handleSendReply}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-[#B91C1C] hover:bg-[#7F1D1D] text-white font-semibold text-xs transition-colors shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send className={`w-3.5 h-3.5 ${isSendingReply ? 'animate-spin' : ''}`} />
                    <span>{isSendingReply ? 'Sending Email...' : 'Send Reply via support@pdfnestly.com'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
