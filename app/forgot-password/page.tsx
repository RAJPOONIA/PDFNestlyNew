'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Mail,
  Lock,
  KeyRound,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';

function ForgotPasswordInner() {
  const searchParams = useSearchParams();
  const initialEmail = searchParams?.get('email') || '';
  const initialToken = searchParams?.get('token') || '';

  const [step, setStep] = useState<'request' | 'requested' | 'confirm' | 'done'>(
    initialToken ? 'confirm' : 'request'
  );
  const [email, setEmail] = useState(initialEmail);
  const [token, setToken] = useState(initialToken);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [emailDeliveryConfigured, setEmailDeliveryConfigured] = useState<
    boolean | null
  >(null);

  useEffect(() => {
    if (initialEmail) setEmail(initialEmail);
    if (initialToken) {
      setToken(initialToken);
      setStep('confirm');
      // Immediately scrub sensitive query parameters from browser history and address bar
      // to prevent token exposure via browser history, shoulder-surfing, or Referer headers.
      if (typeof window !== 'undefined' && window.location.search) {
        window.history.replaceState(
          {},
          document.title,
          window.location.pathname
        );
      }
    }
  }, [initialEmail, initialToken]);

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setStatusMessage('');
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        referrerPolicy: 'no-referrer',
        body: JSON.stringify({ action: 'request', email }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Unable to process reset request.');
      }
      setEmailDeliveryConfigured(
        typeof data.emailDeliveryConfigured === 'boolean'
          ? data.emailDeliveryConfigured
          : null
      );
      setStatusMessage(
        data.message ||
          'If an account exists for that email address, password reset instructions have been sent. Please check your email inbox.'
      );
      setStep('requested');
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Request failed.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setStatusMessage('');

    if (newPassword !== confirmPassword) {
      setErrorMessage('New password and confirmation password do not match.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        referrerPolicy: 'no-referrer',
        body: JSON.stringify({
          action: 'confirm',
          email: email || undefined,
          token,
          newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to reset password.');
      }
      setToken('');
      setNewPassword('');
      setConfirmPassword('');
      setStatusMessage(
        data.message || 'Your password has been updated successfully!'
      );
      setStep('done');
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Password reset failed.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center px-6 py-12 bg-[#FAFAFA] dark:bg-[#09090B]">
      <div className="w-full max-w-md bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl shadow-sm p-8 space-y-6">
        <div className="space-y-2">
          <div className="w-11 h-11 rounded-xl bg-[#FEF2F2] dark:bg-[#B91C1C]/15 text-[#B91C1C] flex items-center justify-center">
            <KeyRound className="w-5 h-5" />
          </div>
          <h1 className="text-2xl font-bold text-[#18181B] dark:text-[#FAFAFA] tracking-tight">
            {step === 'request' || step === 'requested'
              ? 'Reset Your Password'
              : step === 'confirm'
              ? 'Set a New Password'
              : 'Password Updated'}
          </h1>
          <p className="text-xs text-[#52525B] dark:text-[#D4D4D8]">
            {step === 'request'
              ? 'Enter the email address associated with your PDFNestly account and we will send you a password reset link.'
              : step === 'requested'
              ? 'Check your email inbox and spam folder for password reset instructions.'
              : step === 'confirm'
              ? 'Choose a strong new password for your PDFNestly account.'
              : 'Your account password has been updated. You can now sign in with your new credentials.'}
          </p>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="p-3.5 rounded-xl bg-[#D64545]/10 border border-[#D64545]/30 text-xs text-[#D64545] dark:text-[#F87171] flex items-start gap-2.5"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {step === 'request' && (
          <form onSubmit={handleRequestReset} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="reset-email"
                className="block text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA]"
              >
                Account Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#71717A] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="reset-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] bg-[#FAFAFA] dark:bg-[#27272A] text-[#18181B] dark:text-[#FAFAFA] focus:outline-none focus:border-[#B91C1C]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 rounded-xl bg-[#B91C1C] hover:bg-[#7F1D1D] disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Sending Reset Instructions...</span>
                </>
              ) : (
                <span>Send Password Reset Email</span>
              )}
            </button>
          </form>
        )}

        {step === 'requested' && (
          <div className="space-y-4">
            <div
              role="status"
              className="p-4 rounded-xl bg-[#16865B]/10 border border-[#16865B]/30 text-xs text-[#18181B] dark:text-[#FAFAFA] space-y-2.5"
            >
              <div className="flex items-start gap-2 font-semibold text-[#16865B] dark:text-[#34D399]">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>Check Your Email</span>
              </div>
              <p className="text-xs text-[#52525B] dark:text-[#D4D4D8] leading-relaxed">
                {statusMessage}
              </p>
              {emailDeliveryConfigured === false && (
                <p className="text-[11px] text-[#71717A] dark:text-[#A1A1AA] pt-1 border-t border-[#16865B]/20">
                  Note: Outbound email delivery requires a configured email provider on the server (such as Resend, SendGrid, Postmark, or an email webhook). No reset token is ever returned in the browser response.
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setErrorMessage('');
                setStatusMessage('');
                setStep('request');
              }}
              className="w-full py-2.5 px-4 rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] hover:bg-[#F4F4F5] dark:hover:bg-[#27272A] text-[#18181B] dark:text-[#FAFAFA] text-xs font-semibold transition-colors cursor-pointer"
            >
              Use a Different Email Address
            </button>
          </div>
        )}

        {step === 'confirm' && (
          <form onSubmit={handleConfirmReset} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="confirm-new-password"
                className="block text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA]"
              >
                New Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#71717A] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="confirm-new-password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 chars with letter & number"
                  className="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] bg-[#FAFAFA] dark:bg-[#27272A] text-[#18181B] dark:text-[#FAFAFA] focus:outline-none focus:border-[#B91C1C]"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="confirm-repeat-password"
                className="block text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA]"
              >
                Confirm New Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#71717A] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="confirm-repeat-password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat your new password"
                  className="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] bg-[#FAFAFA] dark:bg-[#27272A] text-[#18181B] dark:text-[#FAFAFA] focus:outline-none focus:border-[#B91C1C]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 rounded-xl bg-[#B91C1C] hover:bg-[#7F1D1D] disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Updating Password...</span>
                </>
              ) : (
                <span>Update Password</span>
              )}
            </button>
          </form>
        )}

        {step === 'done' && (
          <div className="space-y-4">
            <div
              role="status"
              className="p-4 rounded-xl bg-[#16865B]/10 border border-[#16865B]/30 text-xs text-[#16865B] dark:text-[#34D399] flex items-start gap-2 font-semibold"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{statusMessage}</span>
            </div>
            <Link
              href="/login"
              referrerPolicy="no-referrer"
              className="w-full py-2.5 px-4 rounded-xl bg-[#B91C1C] hover:bg-[#7F1D1D] text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              <span>Return to Sign In</span>
            </Link>
          </div>
        )}

        <div className="pt-4 border-t border-[#E4E4E7] dark:border-[#3F3F46]">
          <Link
            href="/login"
            referrerPolicy="no-referrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#52525B] dark:text-[#A1A1AA] hover:text-[#18181B] dark:hover:text-[#FAFAFA]"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Sign In</span>
          </Link>
        </div>
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
