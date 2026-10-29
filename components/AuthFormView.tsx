'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Mail,
  Lock,
  User as UserIcon,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from './AuthProvider';
import { PdfNestlyMark } from './Logo';

function AuthFormInner({ initialMode }: { initialMode: 'login' | 'signup' }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTarget = searchParams?.get('redirect') || '/dashboard';
  const {
    user,
    settings,
    loginWithGoogle,
    loginWithEmail,
    registerWithEmail,
  } = useAuth();

  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [awaitingEmailCheck, setAwaitingEmailCheck] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    if (user && !awaitingEmailCheck) {
      router.push(redirectTarget);
    }
  }, [user, awaitingEmailCheck, router, redirectTarget]);

  const handleGoogleSignIn = async () => {
    setErrorMessage('');
    setStatusMessage('');
    setIsGoogleLoading(true);
    try {
      const loggedIn = await loginWithGoogle();
      router.push(loggedIn.role === 'admin' && redirectTarget === '/admin' ? '/admin' : redirectTarget);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Google sign-in could not be completed.';
      if (msg.includes('auth/popup-closed-by-user')) {
        setErrorMessage('Google sign-in popup was closed before completing authentication.');
      } else if (msg.includes('auth/unauthorized-domain')) {
        setErrorMessage(
          'This domain is not yet authorized in Firebase Console > Authentication > Settings > Authorized domains.'
        );
      } else {
        setErrorMessage(msg);
      }
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setStatusMessage('');
    setIsSubmitting(true);

    try {
      if (mode === 'login') {
        const loggedIn = await loginWithEmail(email, password);
        router.push(
          loggedIn.role === 'admin' && redirectTarget === '/admin'
            ? '/admin'
            : redirectTarget
        );
      } else {
        const reg = await registerWithEmail({
          email,
          password,
          displayName,
        });
        if (!reg.user.emailVerified) {
          setAwaitingEmailCheck(true);
          setStatusMessage(
            reg.message ||
              'Account created! Please check your email inbox for your verification link.'
          );
        } else {
          router.push(redirectTarget);
        }
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Authentication failed.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center px-6 py-12 bg-[#FAFAFA] dark:bg-[#09090B]">
      <div className="w-full max-w-md bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl shadow-sm p-8 space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#FEF2F2] dark:bg-[#B91C1C]/15 mb-1">
            <PdfNestlyMark size={28} />
          </div>
          <h1 className="text-2xl font-bold text-[#18181B] dark:text-[#FAFAFA] tracking-tight">
            {mode === 'login'
              ? 'Sign in to PDFNestly'
              : 'Create your PDFNestly Account'}
          </h1>
          <p className="text-xs text-[#52525B] dark:text-[#D4D4D8]">
            {mode === 'login'
              ? 'Access your PDF processing history, saved preferences, and workspace.'
              : 'Track your PDF tool history and manage your document workflow securely.'}
          </p>
        </div>

        {/* Mode Switch Tabs */}
        <div
          role="tablist"
          aria-label="Authentication mode"
          className="grid grid-cols-2 p-1 bg-[#F4F4F5] dark:bg-[#27272A] rounded-xl text-xs font-semibold"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            onClick={() => {
              setMode('login');
              setErrorMessage('');
              setStatusMessage('');
            }}
            className={`py-2 rounded-lg transition-colors cursor-pointer ${
              mode === 'login'
                ? 'bg-white dark:bg-[#18181B] text-[#18181B] dark:text-[#FAFAFA] shadow-2xs'
                : 'text-[#52525B] dark:text-[#A1A1AA] hover:text-[#18181B] dark:hover:text-[#FAFAFA]'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signup'}
            onClick={() => {
              setMode('signup');
              setErrorMessage('');
              setStatusMessage('');
            }}
            className={`py-2 rounded-lg transition-colors cursor-pointer ${
              mode === 'signup'
                ? 'bg-white dark:bg-[#18181B] text-[#18181B] dark:text-[#FAFAFA] shadow-2xs'
                : 'text-[#52525B] dark:text-[#A1A1AA] hover:text-[#18181B] dark:hover:text-[#FAFAFA]'
            }`}
          >
            Create Account
          </button>
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

        {statusMessage && (
          <div
            role="status"
            className="p-4 rounded-xl bg-[#16865B]/10 border border-[#16865B]/30 text-xs text-[#18181B] dark:text-[#FAFAFA] space-y-2.5"
          >
            <div className="flex items-start gap-2 font-semibold text-[#16865B] dark:text-[#34D399]">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{statusMessage}</span>
            </div>
            {awaitingEmailCheck && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Link
                  href={redirectTarget}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#16865B] text-white font-semibold hover:bg-[#126E4A] transition-colors"
                >
                  <span>Continue to Dashboard</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Continue with Google OAuth */}
        {settings.googleAuthEnabled && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isGoogleLoading || isSubmitting}
              className="w-full py-2.5 px-4 rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] bg-white dark:bg-[#27272A] hover:bg-[#FAFAFA] dark:hover:bg-[#18181B] text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA] flex items-center justify-center gap-2.5 transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
            >
              {isGoogleLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin text-[#B91C1C]" />
              ) : (
                <span className="w-4 h-4 rounded-full bg-[#B91C1C] text-white font-bold text-[10px] flex items-center justify-center">
                  G
                </span>
              )}
              <span>Continue with Google</span>
            </button>

            <div className="relative flex items-center justify-center">
              <div className="border-t border-[#E4E4E7] dark:border-[#3F3F46] w-full" />
              <span className="bg-white dark:bg-[#18181B] px-3 text-[11px] uppercase tracking-wider text-[#71717A]">
                or with email
              </span>
              <div className="border-t border-[#E4E4E7] dark:border-[#3F3F46] w-full" />
            </div>
          </div>
        )}

        {/* Email & Password Form */}
        <form onSubmit={handleEmailSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div className="space-y-1.5">
              <label
                htmlFor="auth-display-name"
                className="block text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA]"
              >
                Full Name
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-[#71717A] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="auth-display-name"
                  type="text"
                  required
                  minLength={2}
                  maxLength={120}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Jane Doe"
                  className="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] bg-[#FAFAFA] dark:bg-[#27272A] text-[#18181B] dark:text-[#FAFAFA] focus:outline-none focus:border-[#B91C1C]"
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label
              htmlFor="auth-email"
              className="block text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA]"
            >
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-[#71717A] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="auth-email"
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

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="auth-password"
                className="block text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA]"
              >
                Password
              </label>
              {mode === 'login' && (
                <Link
                  href="/forgot-password"
                  className="text-xs font-semibold text-[#B91C1C] dark:text-[#EF4444] hover:underline"
                >
                  Forgot password?
                </Link>
              )}
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 text-[#71717A] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="auth-password"
                type="password"
                required
                minLength={8}
                autoComplete={
                  mode === 'login' ? 'current-password' : 'new-password'
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={
                  mode === 'signup'
                    ? 'At least 8 chars with letter & number'
                    : 'Enter your password'
                }
                className="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] bg-[#FAFAFA] dark:bg-[#27272A] text-[#18181B] dark:text-[#FAFAFA] focus:outline-none focus:border-[#B91C1C]"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || isGoogleLoading}
            className="w-full py-2.5 px-4 rounded-xl bg-[#B91C1C] hover:bg-[#7F1D1D] disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-xs"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>
                  {mode === 'login' ? 'Signing In...' : 'Creating Account...'}
                </span>
              </>
            ) : (
              <>
                <span>
                  {mode === 'login'
                    ? 'Sign In with Email'
                    : 'Create Account'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Footer note */}
        <div className="pt-4 border-t border-[#E4E4E7] dark:border-[#3F3F46] flex items-center justify-between text-[11px] text-[#71717A]">
          <span className="inline-flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-[#16865B]" />
            Public PDF tools work without sign-in
          </span>
          <Link href="/tools" className="font-semibold text-[#B91C1C] hover:underline">
            Browse 30 PDF Tools →
          </Link>
        </div>
      </div>
    </div>
  );
}

export function AuthFormView({
  initialMode = 'login',
}: {
  initialMode?: 'login' | 'signup';
}) {
  return (
    <Suspense fallback={<div className="min-h-[60vh]" />}>
      <AuthFormInner initialMode={initialMode} />
    </Suspense>
  );
}
