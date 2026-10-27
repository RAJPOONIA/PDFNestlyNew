'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Sun, Moon, Menu, X } from 'lucide-react';
import { PdfNestlyLogo } from './Logo';
import { useTheme } from './ThemeProvider';

export function Navbar() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { href: '/tools', label: 'All Tools', match: '/tools' },
    { href: '/merge-pdf', label: 'Merge & Split', match: '/merge-pdf' },
    { href: '/compress-pdf', label: 'Compress', match: '/compress-pdf' },
    { href: '/privacy', label: 'Privacy & Security', match: '/privacy' },
    { href: '/help', label: 'Help & Docs', match: '/help' },
  ];

  return (
    <header className="sticky top-0 z-40 bg-white/95 dark:bg-[#18181B]/95 backdrop-blur-md border-b border-[#E4E4E7] dark:border-[#3F3F46] transition-colors">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-6 px-6 h-16">
        {/* Zone 1: Original SVG Brand Symbol + Wordmark */}
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
          className="hidden lg:flex items-center gap-1 text-sm font-medium"
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
                className={`px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0 ${
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

        {/* Zone 3: Theme Switcher + Primary Action + Mobile Menu Toggle */}
        <div className="flex items-center gap-2.5 shrink-0">
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

          <Link
            href="/edit-pdf"
            className="hidden sm:inline-flex items-center px-4 py-2 text-xs font-semibold text-white bg-[#B91C1C] hover:bg-[#7F1D1D] rounded-lg shadow-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B91C1C] transition-colors whitespace-nowrap shrink-0"
          >
            Open PDF Workspace
          </Link>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileMenuOpen}
            className="lg:hidden inline-flex items-center justify-center w-9 h-9 rounded-lg border border-[#E4E4E7] dark:border-[#3F3F46] bg-[#FAFAFA] dark:bg-[#27272A] text-[#18181B] dark:text-[#FAFAFA]"
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
        <div className="lg:hidden border-t border-[#E4E4E7] dark:border-[#3F3F46] bg-white dark:bg-[#18181B] px-6 py-4 space-y-3">
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
          <div className="pt-2 border-t border-[#E4E4E7] dark:border-[#3F3F46]">
            <Link
              href="/edit-pdf"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center justify-center w-full px-4 py-2.5 text-xs font-semibold text-white bg-[#B91C1C] hover:bg-[#7F1D1D] rounded-lg transition-colors"
            >
              Open PDF Workspace
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
