'use client';

import React, { useEffect, useState, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, AlertCircle, RefreshCw, ArrowRight } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';

function VerifyEmailInner() {
  const searchParams = useSearchParams();
  const { refreshSession } = useAuth();
  const hasVerifiedRef = useRef(false);

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>(
    'loading'
  );
  const [message, setMessage] = useState('Verifying your email address...');

  useEffect(() => {
    if (hasVerifiedRef.current) return;
    const uid = (searchParams?.get('uid') || '').trim();
    const token = (searchParams?.get('token') || '').trim();

    if (typeof window !== 'undefined' && (uid || token)) {
      window.history.replaceState({}, document.title, '/verify-email');
    }

    if (!token) {
      setStatus('error');
      setMessage('Missing or invalid email verification link.');
      return;
    }

    hasVerifiedRef.current = true;

    (async () => {
      try {
        const res = await fetch('/api/auth/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          referrerPolicy: 'no-referrer',
          body: JSON.stringify({ action: 'verify', uid, token }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Verification failed.');
        }
        await refreshSession();
        setStatus('success');
        setMessage(data.message || 'Your email address has been verified!');
      } catch (err) {
        setStatus('error');
        setMessage(
          err instanceof Error
            ? err.message
            : 'Invalid or expired verification link.'
        );
      }
    })();
  }, [searchParams, refreshSession]);

  return (
    <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center px-6 py-12 bg-[#FAFAFA] dark:bg-[#09090B]">
      <div className="w-full max-w-md bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl shadow-sm p-8 text-center space-y-5">
        {status === 'loading' && (
          <RefreshCw className="w-10 h-10 text-[#B91C1C] animate-spin mx-auto" />
        )}
        {status === 'success' && (
          <CheckCircle2 className="w-12 h-12 text-[#16865B] mx-auto" />
        )}
        {status === 'error' && (
          <AlertCircle className="w-12 h-12 text-[#D64545] mx-auto" />
        )}

        <h1 className="text-xl font-bold text-[#18181B] dark:text-[#FAFAFA]">
          {status === 'loading'
            ? 'Verifying Email...'
            : status === 'success'
            ? 'Email Verified'
            : 'Verification Error'}
        </h1>

        <p className="text-xs text-[#52525B] dark:text-[#D4D4D8] leading-relaxed">
          {message}
        </p>

        <div className="pt-2">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#B91C1C] hover:bg-[#7F1D1D] text-white text-xs font-semibold transition-colors"
          >
            <span>Go to My Dashboard</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="min-h-[60vh]" />}>
      <VerifyEmailInner />
    </Suspense>
  );
}
