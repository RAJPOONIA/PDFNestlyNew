import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ShieldCheck,
  Lock,
  HardDrive,
  UserCheck,
  FileText,
  Cookie,
  Mail,
  ArrowRight,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Privacy & Document Security Policy | PDFNestly',
  description:
    'Learn how PDFNestly protects your documents and privacy. Transparent file handling, private client-side processing, and zero-retention ephemeral workflows.',
  alternates: { canonical: 'https://pdfnestly.com/privacy' },
};

export default function PrivacyPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-12 sm:py-16 space-y-10">
      {/* Policy Header */}
      <div className="space-y-3 border-b border-[#E4E4E7] dark:border-[#3F3F46] pb-8">
        <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#B91C1C] dark:text-[#EF4444]">
          <ShieldCheck className="w-4 h-4 shrink-0" />
          <span>Last Updated: October 2026 · Transparent Document Privacy</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-[#18181B] dark:text-[#FAFAFA] tracking-tight">
          Privacy & Document Security Policy
        </h1>
        <p className="text-base text-[#52525B] dark:text-[#D4D4D8] leading-relaxed max-w-3xl">
          At PDFNestly, we believe document privacy is a fundamental standard,
          not an optional upgrade. This policy explains in plain, clear language
          how our platform handles your files, how processing works, and the
          protections we enforce to keep your documents strictly yours.
        </p>
      </div>

      <div className="space-y-6 text-sm leading-relaxed">
        {/* 1. Your Files and Privacy */}
        <section className="p-6 sm:p-7 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl shadow-xs space-y-3">
          <div className="flex items-center gap-2.5 text-[#18181B] dark:text-[#FAFAFA]">
            <FileText className="w-5 h-5 text-[#B91C1C] dark:text-[#EF4444] shrink-0" />
            <h2 className="text-lg font-bold">1. Your Files and Privacy</h2>
          </div>
          <p className="text-[#52525B] dark:text-[#D4D4D8]">
            You retain 100% ownership, intellectual property rights, and copyright
            over all files you select, upload, or process on PDFNestly. We never
            claim ownership of your documents, and we never view, read, index,
            train artificial intelligence models on, or sell the contents of your
            files to any third party.
          </p>
          <p className="text-[#52525B] dark:text-[#D4D4D8]">
            Your documents are handled solely to carry out the specific task you
            request (such as merging, splitting, compressing, or editing). Once
            that task finishes, your file is delivered back to you for download.
          </p>
        </section>

        {/* 2. How File Processing Works for Users */}
        <section className="p-6 sm:p-7 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl shadow-xs space-y-3">
          <div className="flex items-center gap-2.5 text-[#18181B] dark:text-[#FAFAFA]">
            <Lock className="w-5 h-5 text-[#B91C1C] dark:text-[#EF4444] shrink-0" />
            <h2 className="text-lg font-bold">2. How File Processing Works for Users</h2>
          </div>
          <p className="text-[#52525B] dark:text-[#D4D4D8]">
            To deliver both speed and maximum privacy, PDFNestly utilizes two
            distinct processing paths depending on the technical requirements of the tool:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="p-4 rounded-xl bg-[#FAFAFA] dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46] space-y-2">
              <h3 className="font-bold text-sm text-[#18181B] dark:text-[#FAFAFA] flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                Private In-Browser Processing
              </h3>
              <p className="text-xs text-[#52525B] dark:text-[#D4D4D8] leading-relaxed">
                The vast majority of our tools (including Merge, Split, Page Reorder,
                Rotate, Crop, Watermarks, Canvas Annotations, Signatures, and OCR)
                execute directly within your device’s web browser. During these
                operations, your files never leave your computer or mobile device.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#FAFAFA] dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46] space-y-2">
              <h3 className="font-bold text-sm text-[#18181B] dark:text-[#FAFAFA] flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#B91C1C] dark:bg-[#EF4444] shrink-0" />
                Secure Ephemeral Cloud Processing
              </h3>
              <p className="text-xs text-[#52525B] dark:text-[#D4D4D8] leading-relaxed">
                A small number of specialized operations (such as high-ratio binary
                stream compression, document structure repair, and standard password
                encryption) require dedicated processing workers. Files are sent
                over encrypted HTTPS and processed in transient memory.
              </p>
            </div>
          </div>
        </section>

        {/* 3. File Storage and Retention */}
        <section className="p-6 sm:p-7 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl shadow-xs space-y-3">
          <div className="flex items-center gap-2.5 text-[#18181B] dark:text-[#FAFAFA]">
            <HardDrive className="w-5 h-5 text-[#B91C1C] dark:text-[#EF4444] shrink-0" />
            <h2 className="text-lg font-bold">3. File Storage and Retention</h2>
          </div>
          <p className="text-[#52525B] dark:text-[#D4D4D8]">
            We follow a strict zero-retention standard:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-xs sm:text-sm text-[#52525B] dark:text-[#D4D4D8]">
            <li>
              <strong>In-Browser Operations:</strong> Because files never touch our
              servers, no retention or storage occurs on our infrastructure.
            </li>
            <li>
              <strong>Server-Processed Operations:</strong> When a file is sent for
              server-side processing, it exists only in an isolated temporary
              workspace solely for the seconds required to compute the result.
            </li>
            <li>
              <strong>Instant Deletion:</strong> The temporary workspace and its
              contents are permanently deleted immediately upon completion of the
              request. We do not maintain file archives, backups, or user document
              caches.
            </li>
          </ul>
        </section>

        {/* 4. Personal Information */}
        <section className="p-6 sm:p-7 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl shadow-xs space-y-3">
          <div className="flex items-center gap-2.5 text-[#18181B] dark:text-[#FAFAFA]">
            <UserCheck className="w-5 h-5 text-[#B91C1C] dark:text-[#EF4444] shrink-0" />
            <h2 className="text-lg font-bold">4. Personal Information</h2>
          </div>
          <p className="text-[#52525B] dark:text-[#D4D4D8]">
            PDFNestly is free to use without requiring an account, email address,
            phone number, or credit card. We do not ask for registration or identity
            verification to run our tools.
          </p>
          <p className="text-[#52525B] dark:text-[#D4D4D8]">
            If you voluntarily contact our support team via our contact form or
            email, we use your provided contact details solely to reply to your
            inquiry and assist you with your request.
          </p>
        </section>

        {/* 5. Security Safeguards */}
        <section className="p-6 sm:p-7 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl shadow-xs space-y-3">
          <div className="flex items-center gap-2.5 text-[#18181B] dark:text-[#FAFAFA]">
            <ShieldCheck className="w-5 h-5 text-[#B91C1C] dark:text-[#EF4444] shrink-0" />
            <h2 className="text-lg font-bold">5. Security Safeguards</h2>
          </div>
          <p className="text-[#52525B] dark:text-[#D4D4D8]">
            We implement industry-standard safeguards to protect data while you
            interact with PDFNestly:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-xs sm:text-sm text-[#52525B] dark:text-[#D4D4D8]">
            <li>
              <strong>End-to-End Transport Encryption:</strong> All communication
              between your browser and our servers is secured using modern TLS/HTTPS
              encryption to prevent interception.
            </li>
            <li>
              <strong>Process Isolation:</strong> Server-side operations run in
              isolated worker sandboxes with strict execution timeouts and memory
              bounds.
            </li>
            <li>
              <strong>Permanent Redaction:</strong> When using our PDF Redaction tool,
              the selected page content is irreversibly rasterized and destroyed to
              ensure sensitive data cannot be uncovered or extracted from vector streams.
            </li>
          </ul>
        </section>

        {/* 6. Cookies and Analytics */}
        <section className="p-6 sm:p-7 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl shadow-xs space-y-3">
          <div className="flex items-center gap-2.5 text-[#18181B] dark:text-[#FAFAFA]">
            <Cookie className="w-5 h-5 text-[#B91C1C] dark:text-[#EF4444] shrink-0" />
            <h2 className="text-lg font-bold">6. Cookies and Analytics</h2>
          </div>
          <p className="text-[#52525B] dark:text-[#D4D4D8]">
            PDFNestly does not use cross-site tracking cookies, third-party marketing
            pixels, or advertising profiling.
          </p>
          <p className="text-[#52525B] dark:text-[#D4D4D8]">
            We use standard browser local storage strictly to remember your interface
            preferences (such as your dark or light theme selection) and to display
            your recently used tools locally on your device. This data never leaves
            your browser.
          </p>
        </section>

        {/* 7. Contact and Privacy Requests */}
        <section className="p-6 sm:p-7 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl shadow-xs space-y-4">
          <div className="flex items-center gap-2.5 text-[#18181B] dark:text-[#FAFAFA]">
            <Mail className="w-5 h-5 text-[#B91C1C] dark:text-[#EF4444] shrink-0" />
            <h2 className="text-lg font-bold">7. Contact and Privacy Requests</h2>
          </div>
          <p className="text-[#52525B] dark:text-[#D4D4D8]">
            If you have questions about this privacy policy, how your documents are
            processed, or wish to submit a privacy inquiry, our team is readily
            available to assist you.
          </p>
          <div>
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#B91C1C] hover:bg-[#7F1D1D] text-white font-semibold text-xs transition-colors shadow-xs"
            >
              Contact Support & Privacy Team
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
