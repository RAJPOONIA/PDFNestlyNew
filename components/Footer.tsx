import Link from 'next/link';
import { PdfNestlyLogo } from './Logo';

export function Footer() {
  return (
    <footer className="bg-[#09090B] text-[#D4D4D8] border-t border-[#3F3F46] mt-auto">
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8 pb-8 border-b border-[#3F3F46]">
          <div className="space-y-2 max-w-md">
            <Link
              href="/"
              aria-label="PDFNestly Home"
              className="inline-flex items-center"
            >
              <PdfNestlyLogo iconSize={26} forceDarkText />
            </Link>
            <p className="text-xs text-[#A1A1AA] leading-relaxed">
              Simple, reliable online PDF tools for editing, merging, splitting,
              compressing, and converting documents with speed and privacy.
            </p>
          </div>

          <nav aria-label="Footer Navigation" className="flex flex-wrap items-center gap-x-6 gap-y-3 text-xs font-medium text-[#D4D4D8]">
            <Link href="/tools" className="hover:text-[#FAFAFA] hover:underline underline-offset-4 transition-colors">
              All Tools
            </Link>
            <Link href="/edit-pdf" className="hover:text-[#FAFAFA] hover:underline underline-offset-4 transition-colors">
              PDF Editor
            </Link>
            <Link href="/merge-pdf" className="hover:text-[#FAFAFA] hover:underline underline-offset-4 transition-colors">
              Merge & Split
            </Link>
            <Link href="/compress-pdf" className="hover:text-[#FAFAFA] hover:underline underline-offset-4 transition-colors">
              Compress
            </Link>
            <Link href="/privacy" className="hover:text-[#FAFAFA] hover:underline underline-offset-4 transition-colors">
              Privacy & Security
            </Link>
            <Link href="/help" className="hover:text-[#FAFAFA] hover:underline underline-offset-4 transition-colors">
              Help & Docs
            </Link>
            <Link href="/contact" className="hover:text-[#FAFAFA] hover:underline underline-offset-4 transition-colors">
              Contact
            </Link>
            <Link href="/terms" className="hover:text-[#FAFAFA] hover:underline underline-offset-4 transition-colors">
              Terms
            </Link>
          </nav>
        </div>

        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#A1A1AA]">
          <p>© {new Date().getFullYear()} PDFNestly.com. All rights reserved.</p>
          <div className="flex items-center gap-4 text-[11px]">
            <span>Fast client-first execution</span>
            <span aria-hidden="true">·</span>
            <Link href="/privacy" className="hover:text-[#FAFAFA] transition-colors">
              Document Privacy Policy
            </Link>
            <span aria-hidden="true">·</span>
            <Link href="/terms" className="hover:text-[#FAFAFA] transition-colors">
              Terms of Use
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
