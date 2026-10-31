'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ShieldAlert,
  Lock,
  Mail,
  KeyRound,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Cpu,
  RefreshCw,
  Sun,
  Moon,
  ChevronLeft,
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useTheme } from '@/components/ThemeProvider';
import { isAdminRole } from '@/lib/roles';

export default function AdminLoginPage() {
  const router = useRouter();
  const { user, loginWithEmail, loginWithGoogle, isLoading: authLoading } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showMfa, setShowMfa] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Auto-redirect if already signed in with an authorized admin role
  useEffect(() => {
    if (!authLoading && user) {
      if (isAdminRole(user.role)) {
        router.replace('/admin/dashboard');
      } else {
        setErrorMsg(
          `Access Denied: Account (${user.email}) does not have administrative privileges.`
        );
      }
    }
  }, [user, authLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!email.trim() || !password) {
      setErrorMsg('Please enter both administrative email and password.');
      return;
    }

    setIsSubmitting(true);
    try {
      const signedInUser = await loginWithEmail(email.trim(), password);

      // Check role
      if (!isAdminRole(signedInUser.role)) {
        setErrorMsg(
          `Access Denied (403): Account "${signedInUser.email}" is not authorized to access the PDFNestly Admin Console.`
        );
        setIsSubmitting(false);
        return;
      }

      setSuccessMsg('Authentication verified. Loading administrative console...');
      setTimeout(() => {
        router.replace('/admin/dashboard');
      }, 500);
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : 'An error occurred during authentication.'
      );
      setIsSubmitting(false);
    }
  };

  const handleGoogleAdminLogin = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    setIsSubmitting(true);
    try {
      const signedInUser = await loginWithGoogle();

      if (!isAdminRole(signedInUser.role)) {
        setErrorMsg(
          `Access Denied (403): Account "${signedInUser.email}" is not authorized for administrative access.`
        );
        setIsSubmitting(false);
        return;
      }

      setSuccessMsg('Google Admin SSO verified. Loading console...');
      setTimeout(() => {
        router.replace('/admin/dashboard');
      }, 500);
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Google authentication failed.'
      );
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-[#B91C1C] selection:text-white relative overflow-hidden font-sans">
      {/* Background decorative grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f293710_1px,transparent_1px),linear-gradient(to_bottom,#1f293710_1px,transparent_1px)] bg-[size:3rem_3rem] pointer-events-none" />
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-[#B91C1C]/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-red-950/20 rounded-full blur-3xl pointer-events-none" />

      {/* Top Header */}
      <header className="relative z-10 border-b border-slate-800/80 bg-slate-950/60 backdrop-blur-md px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-2 group text-xs text-slate-400 hover:text-white transition-colors"
          >
            <ChevronLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            <span>Return to Public Site</span>
          </Link>
          <span className="text-slate-700">|</span>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-mono font-medium text-slate-300">
              PDFNestly Admin Console · Node v20
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={toggleTheme}
          className="p-2 rounded-lg border border-slate-800 hover:bg-slate-900 text-slate-400 hover:text-white transition-colors"
          title="Toggle Theme"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </header>

      {/* Main Authentication Box */}
      <main className="relative z-10 flex-1 flex items-center justify-center p-4 sm:p-6 my-auto">
        <div className="max-w-md w-full bg-slate-900/90 border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-8 space-y-6 backdrop-blur-sm">
          {/* Badge & Title */}
          <div className="space-y-2 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#B91C1C]/10 border border-[#B91C1C]/30 text-[#B91C1C] mx-auto shadow-inner">
              <ShieldAlert className="w-6 h-6 text-[#B91C1C]" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white">
              Administrator Authentication
            </h1>
            <p className="text-xs text-slate-400">
              Restricted management portal for Super Admins, Admins, Support, and Analysts.
            </p>
          </div>

          {/* Feedback banners */}
          {errorMsg && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-red-950/50 border border-red-500/40 text-red-200 text-xs flex items-start gap-2.5 leading-relaxed"
            >
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div
              role="status"
              className="p-3.5 rounded-xl bg-emerald-950/50 border border-emerald-500/40 text-emerald-200 text-xs flex items-start gap-2.5 leading-relaxed"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="admin-email"
                className="block text-xs font-semibold text-slate-300"
              >
                Administrative Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                <input
                  id="admin-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@pdfnestly.com"
                  required
                  autoComplete="email"
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-950/80 border border-slate-700/80 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-hidden focus:border-[#B91C1C] focus:ring-1 focus:ring-[#B91C1C] transition-colors"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="admin-password"
                  className="block text-xs font-semibold text-slate-300"
                >
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowMfa(!showMfa)}
                  className="text-[11px] text-[#B91C1C] hover:underline"
                >
                  {showMfa ? 'Hide MFA Code' : '+ Add MFA Code'}
                </button>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                <input
                  id="admin-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  autoComplete="current-password"
                  className="w-full pl-9 pr-10 py-2.5 bg-slate-950/80 border border-slate-700/80 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-hidden focus:border-[#B91C1C] focus:ring-1 focus:ring-[#B91C1C] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-slate-500 hover:text-slate-300 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Optional Multi-Factor Authentication Code */}
            {showMfa && (
              <div className="space-y-1.5 animate-in fade-in duration-200">
                <label
                  htmlFor="admin-mfa"
                  className="block text-xs font-semibold text-slate-300 flex items-center justify-between"
                >
                  <span>MFA / Security Code</span>
                  <span className="text-[10px] text-slate-500">6-digit Authenticator OTP</span>
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <input
                    id="admin-mfa"
                    type="text"
                    maxLength={6}
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-950/80 border border-slate-700/80 rounded-xl text-sm text-white font-mono tracking-widest placeholder-slate-500 focus:outline-hidden focus:border-[#B91C1C] focus:ring-1 focus:ring-[#B91C1C] transition-colors"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 px-4 bg-[#B91C1C] hover:bg-[#991B1B] text-white text-sm font-semibold rounded-xl shadow-lg shadow-red-900/30 transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Verifying Credentials...</span>
                </>
              ) : (
                <>
                  <span>Sign In to Admin Console</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative flex items-center justify-center">
            <div className="border-t border-slate-800 w-full" />
            <span className="bg-slate-900 px-3 text-[11px] uppercase tracking-wider text-slate-500 font-semibold absolute">
              or
            </span>
          </div>

          {/* Google SSO Admin */}
          <button
            type="button"
            onClick={handleGoogleAdminLogin}
            disabled={isSubmitting}
            className="w-full py-2.5 px-4 bg-slate-950 hover:bg-slate-800 border border-slate-700 rounded-xl text-sm font-semibold text-slate-200 transition-colors flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-60"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Continue with Google Admin SSO</span>
          </button>

          {/* Security Notice */}
          <div className="pt-2 border-t border-slate-800/80 text-center">
            <p className="text-[11px] text-slate-500 leading-normal flex items-center justify-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-slate-600" />
              <span>Strict Role-Based Access Control (RBAC) enforced on all endpoints.</span>
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-800/80 bg-slate-950/60 backdrop-blur-md px-6 py-3 text-center text-xs text-slate-600">
        © 2026 PDFNestly.com · Security Audit & Access Control Platform
      </footer>
    </div>
  );
}
