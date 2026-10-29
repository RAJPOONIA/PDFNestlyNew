'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Mail,
  Lock,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '@/lib/firebase';

function ForgotPasswordInner() {
  const searchParams = useSearchParams();
  const initialEmail = searchParams?.get('email') || '';
  const initialToken = searchParams?.get('token') || '';

  const [email, setEmail] = useState(initialEmail);
  const [token, setToken] = useState(initialToken);
  const [newPassword, setNewPassword] = useState('');
  const [resetUrl, setResetUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const isConfirmStep = Boolean(token);

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');
    setResetUrl(null);
    setIsSubmitting(true);

    try {
      // Also trigger Firebase password reset email if account exists in Firebase Auth
      sendPasswordResetEmail(auth, email.trim()).catch(() => {});

      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'request', email }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Unable to process password reset request.');
      }
      setSuccessMessage(data.message);
      if (data.resetUrl) {
        setResetUrl(data.resetUrl);
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Password reset request failed.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'confirm',
          email,
          token,
          newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Unable to reset password.');
      }
      setSuccessMessage(
        data.message || 'Your password has been updated. You can now sign in.'
      );
      setToken('');
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Password reset failed.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center px-6 py-12 bg-[#FAFAFA] dark:bg-[#09090B]">
      <div className="w-full max-w-md bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl shadow-sm p-8 space-y-6">
        <div className="space-y-1.5">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#B91C1C] dark:text-[#EF4444] hover:underline"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Sign In</span>
          </Link>
          <h1 className="text-2xl font-bold text-[#18181B] dark:text-[#FAFAFA]">
            {isConfirmStep ? 'Set a New Password' : 'Reset Your Password'}
          </h1>
          <p className="text-xs text-[#52525B] dark:text-[#D4D4D8]">
            {isConfirmStep
              ? 'Enter a strong new password (at least 8 characters with letters and numbers).'
              : 'Enter the email address associated with your PDFNestly account.'}
          </p>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="p-3.5 rounded-xl bg-[#D64545]/10 border border-[#D64545]/30 text-xs text-[#D64545] dark:text-[#F87171] flex items-start gap-2"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div
            role="status"
            className="p-4 rounded-xl bg-[#16865B]/10 border border-[#16865B]/30 text-xs text-[#18181B] dark:text-[#FAFAFA] space-y-2.5"
          >
            <div className="flex items-start gap-2 font-semibold text-[#16865B] dark:text-[#34D399]">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{successMessage}</span>
            </div>
            {resetUrl && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => {
                    const parsed = new URL(resetUrl, window.location.origin);
                    setToken(parsed.searchParams.get('token') || '');
                    setResetUrl(null);
                    setSuccessMessage('');
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#B91C1C] text-white font-semibold hover:bg-[#7F1D1D] transition-colors cursor-pointer"
                >
                  Open Password Reset Form
                </button>
              </div>
            )}
            {!resetUrl && !isConfirmStep && (
              <div className="pt-1">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#16865B] text-white font-semibold hover:bg-[#126E4A] transition-colors"
                >
                  Return to Sign In
                </Link>
              </div>
            )}
          </div>
        )}

        {isConfirmStep ? (
          <form onSubmit={handleConfirmReset} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="reset-email"
                className="block text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA]"
              >
                Account Email
              </label>
              <input
                id="reset-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] bg-[#FAFAFA] dark:bg-[#27272A]"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="reset-new-password"
                className="block text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA]"
              >
                New Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#71717A] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="reset-new-password"
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters with letter & number"
                  className="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] bg-[#FAFAFA] dark:bg-[#27272A]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 px-4 rounded-xl bg-[#B91C1C] hover:bg-[#7F1D1D] text-white text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Updating Password...</span>
                </>
              ) : (
                <span>Save New Password</span>
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRequestReset} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="forgot-email"
                className="block text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA]"
              >
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#71717A] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="forgot-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] bg-[#FAFAFA] dark:bg-[#27272A]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 px-4 rounded-xl bg-[#B91C1C] hover:bg-[#7F1D1D] text-white text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Sending Reset Instructions...</span>
                </>
              ) : (
                <span>Send Password Reset Link</span>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-[60vh]" />}>
      <ForgotPasswordInner />
    </Suspense>
  );
}
