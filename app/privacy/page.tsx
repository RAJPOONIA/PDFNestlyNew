import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldCheck, Lock, Server, Cpu } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Privacy, Security & File Retention Policy',
  description:
    'Read PDFNestly’s privacy architecture: client-side browser PDF tools and ephemeral, zero-retention server processing.',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-14 space-y-10">
      {/* Header */}
      <div className="space-y-3 border-b border-[#E4E4E7] dark:border-[#3F3F46] pb-6">
        <div className="inline-flex items-center gap-2 text-xs font-mono text-[#B91C1C] dark:text-[#EF4444] font-semibold">
          <ShieldCheck className="w-4 h-4" />
          <span>Effective Date: October 27, 2026 · PDFNestly Security & Privacy</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-[#18181B] dark:text-[#FAFAFA] tracking-tight">
          Privacy, Security & Document Retention Policy
        </h1>
        <p className="text-base text-[#52525B] dark:text-[#D4D4D8] leading-relaxed">
          PDFNestly is built with a simple, transparent privacy principle: your
          documents belong entirely to you. We process files locally whenever
          possible and automatically delete temporary server files immediately
          upon completion.
        </p>
      </div>

      <div className="space-y-8 text-sm text-[#52525B] dark:text-[#D4D4D8] leading-relaxed">
        {/* Section 1: Local Browser Processing */}
        <section className="space-y-3 p-6 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-xl shadow-2xs">
          <div className="flex items-center gap-2 text-[#18181B] dark:text-[#FAFAFA]">
            <Cpu className="w-5 h-5 text-[#B91C1C] dark:text-[#EF4444] shrink-0" />
            <h2 className="text-lg font-bold">
              1. Local Browser Execution (Client-Side)
            </h2>
          </div>
          <p>
            The majority of operations on PDFNestly—including merging,
            splitting, reordering, rotating, cropping, page numbering,
            watermarks, image conversions, form filling, OCR transcription, and
            canvas annotations—execute completely inside your web browser’s
            memory.
          </p>
          <p>
            Using modern WebAssembly libraries (<code className="px-1.5 py-0.5 rounded text-xs font-mono bg-[#F4F4F5] dark:bg-[#27272A] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46]">pdf-lib</code>, <code className="px-1.5 py-0.5 rounded text-xs font-mono bg-[#F4F4F5] dark:bg-[#27272A] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46]">pdfjs-dist</code>, and <code className="px-1.5 py-0.5 rounded text-xs font-mono bg-[#F4F4F5] dark:bg-[#27272A] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46]">tesseract.js</code>), your documents never leave your computer or mobile device during these tasks.
          </p>
        </section>

        {/* Section 2: Ephemeral Server Processing */}
        <section className="space-y-3 p-6 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-xl shadow-2xs">
          <div className="flex items-center gap-2 text-[#18181B] dark:text-[#FAFAFA]">
            <Server className="w-5 h-5 text-[#B91C1C] dark:text-[#EF4444] shrink-0" />
            <h2 className="text-lg font-bold">
              2. Ephemeral Server Processing
            </h2>
          </div>
          <p>
            A small number of specialized operations require dedicated backend
            processing engines (such as Ghostscript stream compression and PDF
            repair). When using these tools:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-xs text-[#52525B] dark:text-[#D4D4D8]">
            <li>
              Files are transferred securely over encrypted HTTPS connections.
            </li>
            <li>
              Files are written into an isolated temporary directory dedicated
              solely to your request.
            </li>
            <li>
              The processing command executes with a strict timeout limit.
            </li>
            <li>
              In the deterministic completion handler, all temporary files and
              directories are permanently removed from the server immediately.
            </li>
            <li>
              We never save document contents, extracted text, or passwords to
              any persistent database or log file.
            </li>
          </ul>
        </section>

        {/* Section 3: Redaction & Security */}
        <section className="space-y-3 p-6 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-xl shadow-2xs">
          <div className="flex items-center gap-2 text-[#18181B] dark:text-[#FAFAFA]">
            <Lock className="w-5 h-5 text-[#B91C1C] dark:text-[#EF4444] shrink-0" />
            <h2 className="text-lg font-bold">
              3. Permanent Redaction & Data Protection
            </h2>
          </div>
          <p>
            Our redaction tool is built to ensure sensitive text cannot be
            recovered. Unlike basic viewer overlays that merely cover text with
            a black box, PDFNestly flattens and rasterizes redacted pages to
            permanently destroy the underlying text stream, followed by an
            automated verification check to confirm the text has been
            eliminated.
          </p>
        </section>

        {/* Section 4: Analytics & Cookies */}
        <section className="space-y-3 p-6 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-xl shadow-2xs">
          <h2 className="text-lg font-bold text-[#18181B] dark:text-[#FAFAFA]">
            4. Local Preferences & Storage
          </h2>
          <p>
            PDFNestly uses browser <code className="px-1.5 py-0.5 rounded text-xs font-mono bg-[#F4F4F5] dark:bg-[#27272A] text-[#18181B] dark:text-[#FAFAFA] border border-[#E4E4E7] dark:border-[#3F3F46]">localStorage</code> strictly to remember your preferred theme (dark or light mode) and your recently used tools list. We do not use intrusive cross-site tracking cookies.
          </p>
        </section>

        <div className="pt-4 border-t border-[#E4E4E7] dark:border-[#3F3F46] flex flex-wrap items-center justify-between gap-4 text-xs text-[#71717A] dark:text-[#A1A1AA]">
          <p>Questions regarding our privacy architecture?</p>
          <Link
            href="/contact"
            className="font-semibold text-[#B91C1C] dark:text-[#EF4444] hover:underline"
          >
            Contact Engineering & Privacy Support →
          </Link>
        </div>
      </div>
    </div>
  );
}
