'use client';

import React, { useState } from 'react';
import { CheckCircle2, AlertCircle, Send } from 'lucide-react';

export default function ContactPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [topic, setTopic] = useState('Technical Support');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submittedTicket, setSubmittedTicket] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim() || !email.trim() || !message.trim()) {
      setError('Please complete all required fields (Name, Email, and Message).');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }

    setIsSubmitting(true);
    try {
      let clientTimeZone: string | undefined;
      try {
        clientTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      } catch {
        // fallback
      }

      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          topic,
          message: message.trim(),
          timeZone: clientTimeZone,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit inquiry.');
      }

      setSubmittedTicket(data.ticketId || `PDFN-${Date.now().toString().slice(-6)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred while sending your message.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-14 space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-[#18181B] dark:text-[#FAFAFA] tracking-tight">
          Contact PDFNestly Support & Engineering
        </h1>
        <p className="text-sm text-[#52525B] dark:text-[#D4D4D8]">
          Have a question about a specific PDF structure, batch workflow, or
          self-hosted container licensing? Send us a message below.
        </p>
      </div>

      {submittedTicket ? (
        <div className="p-6 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-3">
          <div className="flex items-center gap-2 text-[#18181B] dark:text-[#FAFAFA] font-bold text-base">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <span>Support Inquiry Received (Reference #{submittedTicket})</span>
          </div>
          <p className="text-xs text-[#52525B] dark:text-[#D4D4D8] leading-relaxed">
            Thank you, <strong className="text-[#18181B] dark:text-[#FAFAFA]">{name}</strong>. We have logged your inquiry under
            topic <strong className="text-[#18181B] dark:text-[#FAFAFA]">{topic}</strong> and will respond to{' '}
            <strong className="text-[#18181B] dark:text-[#FAFAFA]">{email}</strong>.
          </p>
          <button
            type="button"
            onClick={() => {
              setSubmittedTicket(null);
              setName('');
              setEmail('');
              setMessage('');
            }}
            className="px-4 py-2 text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA] bg-white dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg hover:bg-[#FAFAFA] transition-colors cursor-pointer"
          >
            Submit Another Inquiry
          </button>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          noValidate
          className="p-6 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-xl space-y-4 shadow-xs"
        >
          {error && (
            <div
              role="alert"
              className="p-3 bg-[#D64545]/10 border border-[#D64545]/30 rounded-lg flex items-center gap-2 text-xs text-[#D64545] dark:text-[#F87171]"
            >
              <AlertCircle className="w-4 h-4 text-[#D64545] dark:text-[#F87171] shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="contact-name"
                className="block text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA] mb-1"
              >
                Your Full Name *
              </label>
              <input
                id="contact-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
                className="w-full px-3 py-2 text-xs bg-white dark:bg-[#27272A] text-[#18181B] dark:text-[#FAFAFA] placeholder:text-[#71717A] dark:placeholder:text-[#A1A1AA] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#B91C1C]"
              />
            </div>

            <div>
              <label
                htmlFor="contact-email"
                className="block text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA] mb-1"
              >
                Work or Personal Email *
              </label>
              <input
                id="contact-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@company.com"
                className="w-full px-3 py-2 text-xs bg-white dark:bg-[#27272A] text-[#18181B] dark:text-[#FAFAFA] placeholder:text-[#71717A] dark:placeholder:text-[#A1A1AA] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#B91C1C]"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="contact-topic"
              className="block text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA] mb-1"
            >
              Inquiry Category
            </label>
            <select
              id="contact-topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-white dark:bg-[#27272A] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#B91C1C]"
            >
              <option value="Technical Support">Technical Support & Bug Report</option>
              <option value="Enterprise Self-Hosted Licensing">
                Enterprise Self-Hosted Licensing
              </option>
              <option value="Privacy & Security Compliance">
                Privacy & Security Compliance
              </option>
              <option value="Feature Request">Feature Request</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="contact-message"
              className="block text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA] mb-1"
            >
              Message Details *
            </label>
            <textarea
              id="contact-message"
              rows={5}
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe the PDF workflow or question..."
              className="w-full p-3 text-xs bg-white dark:bg-[#27272A] text-[#18181B] dark:text-[#FAFAFA] placeholder:text-[#71717A] dark:placeholder:text-[#A1A1AA] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#B91C1C]"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-[#B91C1C] hover:bg-[#7F1D1D] disabled:opacity-60 disabled:cursor-not-allowed rounded-lg cursor-pointer transition-colors shadow-xs"
          >
            <Send className={`w-3.5 h-3.5 ${isSubmitting ? 'animate-spin' : ''}`} />
            <span>{isSubmitting ? 'Sending Message...' : 'Send Support Message'}</span>
          </button>
        </form>
      )}
    </div>
  );
}
