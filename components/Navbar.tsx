'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Sun,
  Moon,
  Menu,
  X,
  User,
  Shield,
  LogOut,
  LogIn,
} from 'lucide-react';
import { PdfNestlyLogo } from './Logo';
import { useTheme } from './ThemeProvider';
import { useAuth } from './AuthProvider';
import { isAdminRole } from '@/lib/roles';

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const { user, isLoading, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Hide public website navigation inside standalone PDFNestly Studio routes and the separate Admin Portal
  if (pathname === '/edit-pdf' || pathname === '/sign-pdf' || pathname.startsWith('/admin')) {
    return null;
  }

  const navLinks = [
    { href: '/tools', label: 'All PDF Tools', match: '/tools' },
    { href: '/edit-pdf', label: 'Edit PDF', match: '/edit-pdf' },
    { href: '/crop-pdf', label: 'Crop PDF', match: '/crop-pdf' },
    { href: '/organize-pdf', label: 'Organize PDF', match: '/organize-pdf' },
    { href: '/fill-pdf-forms', label: 'Fill Forms', match: '/fill-pdf-forms' },
    { href: '/merge-pdf', label: 'Merge & Split', match: '/merge-pdf' },
    { href: '/compress-pdf', label: 'Compress', match: '/compress-pdf' },
    { href: '/help', label: 'Help', match: '/help' },
  ];

  const handleLogout = async () => {
    setMobileMenuOpen(false);
    await logout();
    router.push('/');
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 dark:bg-[#18181B]/95 backdrop-blur-md border-b border-[#E4E4E7] dark:border-[#3F3F46] transition-colors">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 px-6 h-16">
        {/* Zone 1: Brand Symbol + Wordmark */}
        <Link
          href="/"
          aria-label="PDFNestly Home"
          className="flex items-center shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B91C1C] rounded-lg"
        >
          <PdfNestlyLogo iconSize={28} />
        </Link>

        {/* Zone 2: Desktop Primary Navigation */}
        <nav
          aria-label="Primary Navigation"
          className="hidden xl:flex items-center gap-1 text-sm font-medium"
        >
          {navLinks.map((item) => {
            const isActive =
              item.match === '/'
                ? pathname === '/'
                : pathname.startsWith(item.match);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'text-[#B91C1C] dark:text-[#EF4444] bg-[#FEF2F2] dark:bg-[#B91C1C]/15 font-semibold'
                    : 'text-[#52525B] dark:text-[#D4D4D8] hover:text-[#18181B] dark:hover:text-[#FAFAFA] hover:bg-[#F4F4F5] dark:hover:bg-[#27272A]'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Zone 3: Theme Switcher + Account/Admin Actions + Mobile Menu Toggle */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={
              theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
            }
            title={
              theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'
            }
            className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-[#E4E4E7] dark:border-[#3F3F46] bg-[#FAFAFA] dark:bg-[#27272A] text-[#18181B] dark:text-[#FAFAFA] hover:border-[#B91C1C] dark:hover:border-[#EF4444] transition-colors cursor-pointer"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-[#52525B]" />
            )}
          </button>

          {!isLoading && user ? (
            <div className="hidden sm:flex items-center gap-2">
              {isAdminRole(user.role) && (
                <Link
                  href="/admin/dashboard"
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap ${
                    pathname.startsWith('/admin')
                      ? 'bg-[#B91C1C] text-white border-[#B91C1C]'
                      : 'bg-[#FEF2F2] dark:bg-[#B91C1C]/15 text-[#B91C1C] dark:text-[#EF4444] border-[#FECACA] dark:border-[#B91C1C]/40 hover:bg-[#FEE2E2]'
                  }`}
                >
                  <Shield className="w-3.5 h-3.5" />
                  <span>Admin</span>
                </Link>
              )}

              <Link
                href="/dashboard"
                className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap ${
                  pathname.startsWith('/dashboard')
                    ? 'border-[#B91C1C] text-[#B91C1C] dark:text-[#EF4444] bg-[#FEF2F2] dark:bg-[#B91C1C]/15'
                    : 'border-[#E4E4E7] dark:border-[#3F3F46] bg-[#FAFAFA] dark:bg-[#27272A] text-[#18181B] dark:text-[#FAFAFA] hover:border-[#B91C1C]'
                }`}
              >
                <User className="w-3.5 h-3.5 text-[#B91C1C] dark:text-[#EF4444]" />
                <span className="max-w-[120px] truncate">{user.displayName}</span>
              </Link>

              <button
                type="button"
                onClick={handleLogout}
                aria-label="Sign out"
                title="Sign Out"
                className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-[#E4E4E7] dark:border-[#3F3F46] bg-[#FAFAFA] dark:bg-[#27272A] text-[#52525B] dark:text-[#D4D4D8] hover:text-[#B91C1C] hover:border-[#B91C1C] transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="hidden sm:flex items-center gap-2">
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA] hover:bg-[#F4F4F5] dark:hover:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg transition-colors whitespace-nowrap"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Sign In</span>
              </Link>

              <Link
                href="/edit-pdf"
                className="inline-flex items-center px-3.5 py-2 text-xs font-semibold text-white bg-[#B91C1C] hover:bg-[#7F1D1D] rounded-lg shadow-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B91C1C] transition-colors whitespace-nowrap shrink-0"
              >
                Open PDF Workspace
              </Link>
            </div>
          )}

          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label={
              mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'
            }
            aria-expanded={mobileMenuOpen}
            className="xl:hidden inline-flex items-center justify-center w-9 h-9 rounded-lg border border-[#E4E4E7] dark:border-[#3F3F46] bg-[#FAFAFA] dark:bg-[#27272A] text-[#18181B] dark:text-[#FAFAFA]"
          >
            {mobileMenuOpen ? (
              <X className="w-4 h-4" />
            ) : (
              <Menu className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Responsive Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="xl:hidden border-t border-[#E4E4E7] dark:border-[#3F3F46] bg-white dark:bg-[#18181B] px-6 py-4 space-y-3">
          <nav className="flex flex-col space-y-1">
            {navLinks.map((item) => {
              const isActive =
                item.match === '/'
                  ? pathname === '/'
                  : pathname.startsWith(item.match);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'text-[#B91C1C] dark:text-[#EF4444] bg-[#FEF2F2] dark:bg-[#B91C1C]/15 font-semibold'
                      : 'text-[#18181B] dark:text-[#FAFAFA] hover:bg-[#F4F4F5] dark:hover:bg-[#27272A]'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="pt-3 border-t border-[#E4E4E7] dark:border-[#3F3F46] flex flex-col gap-2">
            {user ? (
              <>
                <Link
                  href="/dashboard"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-center gap-2 w-full px-4 py-2.5 text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA] bg-[#FAFAFA] dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg"
                >
                  <User className="w-4 h-4 text-[#B91C1C]" />
                  <span>My Account ({user.displayName})</span>
                </Link>
                {isAdminRole(user.role) && (
                  <Link
                    href="/admin/dashboard"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center justify-center gap-2 w-full px-4 py-2.5 text-xs font-semibold text-white bg-[#B91C1C] hover:bg-[#7F1D1D] rounded-lg"
                  >
                    <Shield className="w-4 h-4" />
                    <span>Admin Console</span>
                  </Link>
                )}
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex items-center justify-center gap-2 w-full px-4 py-2.5 text-xs font-semibold text-[#B91C1C] border border-[#FECACA] dark:border-[#B91C1C]/40 rounded-lg"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-center gap-2 w-full px-4 py-2.5 text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA] bg-[#FAFAFA] dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Sign In / Create Account</span>
                </Link>
                <Link
                  href="/edit-pdf"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-center w-full px-4 py-2.5 text-xs font-semibold text-white bg-[#B91C1C] hover:bg-[#7F1D1D] rounded-lg transition-colors"
                >
                  Open PDF Workspace
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
