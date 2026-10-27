import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description:
    'PDFNestly Terms of Service: document processing conditions, client-side execution, and user responsibilities.',
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-14 space-y-10">
      <div className="space-y-3 border-b border-[#E4E4E7] dark:border-[#3F3F46] pb-6">
        <div className="text-xs font-mono text-[#B91C1C] dark:text-[#EF4444] font-semibold">
          Last Updated: October 27, 2026
        </div>
        <h1 className="text-3xl font-bold text-[#18181B] dark:text-[#FAFAFA] tracking-tight">
          Terms of Service
        </h1>
        <p className="text-sm text-[#52525B] dark:text-[#D4D4D8] leading-relaxed">
          Welcome to PDFNestly. By accessing or using our website and PDF tools,
          you agree to be bound by these terms.
        </p>
      </div>

      <div className="space-y-8 text-sm text-[#52525B] dark:text-[#D4D4D8] leading-relaxed">
        <section className="space-y-2 p-6 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-xl">
          <h2 className="text-lg font-bold text-[#18181B] dark:text-[#FAFAFA]">
            1. Document Ownership & Content Responsibility
          </h2>
          <p>
            You retain 100% full ownership, intellectual property rights, and
            copyright of all PDF files, images, and content you process using
            PDFNestly. You are responsible for ensuring you have the legal right
            to modify, convert, or distribute any document you upload.
          </p>
        </section>

        <section className="space-y-2 p-6 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-xl">
          <h2 className="text-lg font-bold text-[#18181B] dark:text-[#FAFAFA]">
            2. Local Processing & Server Ephemerality
          </h2>
          <p>
            Most PDFNestly operations run locally inside your browser’s memory
            space without uploading files. For tools that require server
            execution (such as Ghostscript stream compression and repair), files
            are processed in isolated temporary directories and deleted
            immediately upon completion. PDFNestly never sells or accesses your
            document data.
          </p>
        </section>

        <section className="space-y-2 p-6 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-xl">
          <h2 className="text-lg font-bold text-[#18181B] dark:text-[#FAFAFA]">
            3. Acceptable Use
          </h2>
          <p>
            You agree not to use PDFNestly for any unlawful activity, to
            knowingly distribute malware-infected PDF files, or to attempt to
            disrupt server operations. We reserve the right to limit automated
            or abusive high-frequency requests.
          </p>
        </section>

        <section className="space-y-2 p-6 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-xl">
          <h2 className="text-lg font-bold text-[#18181B] dark:text-[#FAFAFA]">
            4. Service Availability & Disclaimers
          </h2>
          <p>
            PDFNestly is provided on an &ldquo;as is&rdquo; and &ldquo;as
            available&rdquo; basis. While we strive for 100% precision in PDF
            parsing and conversion, we recommend keeping backup copies of
            important files before running destructive operations like page
            deletion or redaction.
          </p>
        </section>

        <div className="pt-2">
          <Link
            href="/privacy"
            className="text-xs font-semibold text-[#B91C1C] dark:text-[#EF4444] hover:underline"
          >
            Review our Document Privacy & Retention Policy →
          </Link>
        </div>
      </div>
    </div>
  );
}
