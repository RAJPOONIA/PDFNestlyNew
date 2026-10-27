import type { Metadata } from 'next';
import Link from 'next/link';
import {
  HelpCircle,
  FileCheck2,
  AlertTriangle,
  Laptop,
  ShieldCheck,
  ArrowRight,
  BookOpen,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Help Center, User Guides & FAQs | PDFNestly',
  description:
    'Find user guides, file limits, troubleshooting tips, and browser compatibility details for all PDFNestly tools.',
  alternates: { canonical: 'https://pdfnestly.com/help' },
};

export default function HelpPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-12 sm:py-16 space-y-10">
      {/* Header */}
      <div className="space-y-3 border-b border-[#E4E4E7] dark:border-[#3F3F46] pb-8">
        <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#B91C1C] dark:text-[#EF4444]">
          <BookOpen className="w-4 h-4 shrink-0" />
          <span>User Documentation & Support</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-[#18181B] dark:text-[#FAFAFA] tracking-tight">
          Help Center & User Documentation
        </h1>
        <p className="text-base text-[#52525B] dark:text-[#D4D4D8] leading-relaxed max-w-3xl">
          Everything you need to know about using PDFNestly. Learn how to process
          documents efficiently, troubleshoot formatting issues, and make the most
          of our 30 specialized PDF tools.
        </p>
      </div>

      <div className="space-y-6 text-sm leading-relaxed">
        {/* 1. Quick Start Workflow */}
        <section className="p-6 sm:p-7 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl shadow-xs space-y-4">
          <div className="flex items-center gap-2.5 text-[#18181B] dark:text-[#FAFAFA]">
            <FileCheck2 className="w-5 h-5 text-[#B91C1C] dark:text-[#EF4444] shrink-0" />
            <h2 className="text-lg font-bold">1. Quick Start Guide</h2>
          </div>
          <p className="text-[#52525B] dark:text-[#D4D4D8]">
            Working with documents on PDFNestly follows three simple steps:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <div className="p-4 rounded-xl bg-[#FAFAFA] dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46]">
              <span className="w-6 h-6 rounded-full bg-[#FEF2F2] dark:bg-[#B91C1C]/20 text-[#B91C1C] dark:text-[#EF4444] text-xs font-bold flex items-center justify-center mb-2">
                1
              </span>
              <h3 className="font-bold text-sm text-[#18181B] dark:text-[#FAFAFA]">Select Your File</h3>
              <p className="text-xs text-[#52525B] dark:text-[#D4D4D8] mt-1">
                Drag and drop your PDF into the tool workspace or browse files from your device.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-[#FAFAFA] dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46]">
              <span className="w-6 h-6 rounded-full bg-[#FEF2F2] dark:bg-[#B91C1C]/20 text-[#B91C1C] dark:text-[#EF4444] text-xs font-bold flex items-center justify-center mb-2">
                2
              </span>
              <h3 className="font-bold text-sm text-[#18181B] dark:text-[#FAFAFA]">Adjust Options</h3>
              <p className="text-xs text-[#52525B] dark:text-[#D4D4D8] mt-1">
                Configure page ranges, compression quality, annotations, or conversion formats.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-[#FAFAFA] dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46]">
              <span className="w-6 h-6 rounded-full bg-[#FEF2F2] dark:bg-[#B91C1C]/20 text-[#B91C1C] dark:text-[#EF4444] text-xs font-bold flex items-center justify-center mb-2">
                3
              </span>
              <h3 className="font-bold text-sm text-[#18181B] dark:text-[#FAFAFA]">Download Result</h3>
              <p className="text-xs text-[#52525B] dark:text-[#D4D4D8] mt-1">
                Click Run to immediately download your processed document.
              </p>
            </div>
          </div>
        </section>

        {/* 2. File Limits & Formats */}
        <section className="p-6 sm:p-7 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl shadow-xs space-y-3">
          <div className="flex items-center gap-2.5 text-[#18181B] dark:text-[#FAFAFA]">
            <HelpCircle className="w-5 h-5 text-[#B91C1C] dark:text-[#EF4444] shrink-0" />
            <h2 className="text-lg font-bold">2. Supported File Formats & Limits</h2>
          </div>
          <div className="space-y-2 text-[#52525B] dark:text-[#D4D4D8] text-xs sm:text-sm">
            <p>
              <strong>File Size:</strong> Individual PDF files up to 100 MB are
              supported for in-browser processing. For very large scanned books or
              high-resolution architectural drawings, we recommend splitting large
              sections first or applying our compression tool.
            </p>
            <p>
              <strong>Document Formats:</strong> Standard PDF (.pdf), image
              formats (.jpg, .jpeg, .png, .webp) for conversion and stamping, and
              Word (.docx) for document conversion workflows.
            </p>
            <p>
              <strong>No Page Count Restrictions:</strong> You can process
              multi-hundred page documents with native vector fidelity.
            </p>
          </div>
        </section>

        {/* 3. Troubleshooting */}
        <section className="p-6 sm:p-7 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl shadow-xs space-y-3">
          <div className="flex items-center gap-2.5 text-[#18181B] dark:text-[#FAFAFA]">
            <AlertTriangle className="w-5 h-5 text-[#B91C1C] dark:text-[#EF4444] shrink-0" />
            <h2 className="text-lg font-bold">3. Troubleshooting Common Issues</h2>
          </div>
          <div className="space-y-3 text-xs sm:text-sm text-[#52525B] dark:text-[#D4D4D8]">
            <div className="p-3.5 rounded-xl bg-[#FAFAFA] dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46]">
              <h4 className="font-semibold text-[#18181B] dark:text-[#FAFAFA] mb-1">
                Password-Protected Documents
              </h4>
              <p>
                If your document requires a password to view, use our Unlock PDF
                tool to decrypt it first before merging, splitting, or editing.
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-[#FAFAFA] dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46]">
              <h4 className="font-semibold text-[#18181B] dark:text-[#FAFAFA] mb-1">
                Scanned Documents Without Searchable Text
              </h4>
              <p>
                Scanned PDFs consist of bitmap images rather than selectable fonts.
                Use our OCR PDF tool to recognize characters and generate an
                interactive text layer.
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-[#FAFAFA] dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46]">
              <h4 className="font-semibold text-[#18181B] dark:text-[#FAFAFA] mb-1">
                Corrupted or Damaged Files
              </h4>
              <p>
                If a file fails to open or displays xref structure errors, run our
                Repair PDF tool to reconstruct damaged cross-reference tables and
                salvage valid pages.
              </p>
            </div>
          </div>
        </section>

        {/* 4. Browser & Device Compatibility */}
        <section className="p-6 sm:p-7 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl shadow-xs space-y-3">
          <div className="flex items-center gap-2.5 text-[#18181B] dark:text-[#FAFAFA]">
            <Laptop className="w-5 h-5 text-[#B91C1C] dark:text-[#EF4444] shrink-0" />
            <h2 className="text-lg font-bold">4. Browser & Device Compatibility</h2>
          </div>
          <p className="text-[#52525B] dark:text-[#D4D4D8]">
            PDFNestly runs seamlessly across all modern browsers supporting standard
            WebAssembly and HTML5 Canvas:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm text-[#52525B] dark:text-[#D4D4D8]">
            <li>Google Chrome & Chromium-based browsers (Brave, Opera, Edge)</li>
            <li>Mozilla Firefox</li>
            <li>Apple Safari (macOS and iOS)</li>
            <li>Android mobile browsers</li>
          </ul>
        </section>

        {/* 5. Open-Source Licenses & Attribution */}
        <section className="p-6 sm:p-7 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-2xl shadow-xs space-y-3">
          <div className="flex items-center gap-2.5 text-[#18181B] dark:text-[#FAFAFA]">
            <ShieldCheck className="w-5 h-5 text-[#B91C1C] dark:text-[#EF4444] shrink-0" />
            <h2 className="text-lg font-bold">5. Open-Source Software Notices</h2>
          </div>
          <p className="text-[#52525B] dark:text-[#D4D4D8] text-xs sm:text-sm">
            PDFNestly is proudly built upon reputable open-source software libraries
            distributed under permissive licenses (including MIT, Apache 2.0, and
            BSD). We extend our gratitude to the open-source community for enabling
            accessible web document technologies.
          </p>
        </section>

        {/* 6. Contact Support */}
        <div className="pt-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 bg-[#FEF2F2] dark:bg-[#B91C1C]/15 border border-[#B91C1C]/20 dark:border-[#EF4444]/20 rounded-2xl">
          <div>
            <h3 className="font-bold text-sm text-[#18181B] dark:text-[#FAFAFA]">
              Need Additional Help?
            </h3>
            <p className="text-xs text-[#52525B] dark:text-[#D4D4D8] mt-0.5">
              Our engineering and product team is here to assist with document questions.
            </p>
          </div>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-[#B91C1C] hover:bg-[#7F1D1D] rounded-xl transition-colors shadow-xs shrink-0"
          >
            Contact Support Team
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
