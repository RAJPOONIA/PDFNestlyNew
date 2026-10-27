import type { Metadata } from 'next';
import Link from 'next/link';
import { Check } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Pricing & Processing Quotas',
  description:
    'Simple, predictable document productivity plans for PDFNestly. All core PDF tools work immediately with zero watermarks.',
  alternates: { canonical: '/pricing' },
};

export default function PricingPage() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-14 space-y-12">
      <div className="max-w-3xl space-y-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-[#B91C1C] dark:text-[#EF4444]">
          Transparent SaaS Pricing · Zero Watermarks
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-[#18181B] dark:text-[#FAFAFA] tracking-tight">
          Simple, Predictable Plans for Every Document Need
        </h1>
        <p className="text-base text-[#52525B] dark:text-[#D4D4D8] leading-relaxed">
          All 30 PDF tools on PDFNestly are available without forced sign-ups or
          watermarks. Choose the plan that best fits your document volume and
          workflow requirements.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Standard Web Suite */}
        <div className="p-6 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-xl flex flex-col justify-between space-y-6 shadow-2xs">
          <div className="space-y-4">
            <div className="text-xs font-mono text-[#71717A] dark:text-[#A1A1AA]">
              For everyday individuals & quick tasks
            </div>
            <h2 className="text-xl font-bold text-[#18181B] dark:text-[#FAFAFA]">
              Standard Free
            </h2>
            <div className="text-3xl font-bold text-[#18181B] dark:text-[#FAFAFA] font-mono tabular-nums">
              $0 <span className="text-xs font-normal text-[#71717A] dark:text-[#A1A1AA]">/ forever</span>
            </div>
            <p className="text-xs text-[#52525B] dark:text-[#D4D4D8] leading-relaxed">
              Full access to client-side browser tools and standard server
              processing up to 50 MB per file.
            </p>
            <ul className="space-y-2.5 pt-4 border-t border-[#E4E4E7] dark:border-[#3F3F46] text-xs text-[#18181B] dark:text-[#FAFAFA]">
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[#B91C1C] dark:text-[#EF4444] shrink-0" />
                <span>All 30 PDF tools unlocked</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[#B91C1C] dark:text-[#EF4444] shrink-0" />
                <span>No watermarks added to documents</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[#B91C1C] dark:text-[#EF4444] shrink-0" />
                <span>Up to 50 MB per document upload</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[#B91C1C] dark:text-[#EF4444] shrink-0" />
                <span>No account registration required</span>
              </li>
            </ul>
          </div>
          <Link
            href="/tools"
            className="w-full py-2.5 px-4 text-center text-xs font-semibold text-white bg-[#B91C1C] hover:bg-[#7F1D1D] rounded-lg transition-colors shadow-xs"
          >
            Use All 30 Tools Free
          </Link>
        </div>

        {/* Pro Workspace */}
        <div className="p-6 bg-[#FAFAFA] dark:bg-[#27272A] border-2 border-[#B91C1C] dark:border-[#EF4444] rounded-xl flex flex-col justify-between space-y-6 shadow-xs relative">
          <div className="space-y-4">
            <div className="inline-block text-[11px] font-semibold text-[#B91C1C] dark:text-[#EF4444] uppercase tracking-wide">
              Most Popular for Teams
            </div>
            <h2 className="text-xl font-bold text-[#18181B] dark:text-[#FAFAFA]">
              Pro Workspace
            </h2>
            <div className="text-3xl font-bold text-[#18181B] dark:text-[#FAFAFA] font-mono tabular-nums">
              $18 <span className="text-xs font-normal text-[#71717A] dark:text-[#A1A1AA]">/ user / mo</span>
            </div>
            <p className="text-xs text-[#52525B] dark:text-[#D4D4D8] leading-relaxed">
              Designed for legal, finance, and operations teams processing high-volume
              scanned PDFs and large files.
            </p>
            <ul className="space-y-2.5 pt-4 border-t border-[#E4E4E7] dark:border-[#3F3F46] text-xs text-[#18181B] dark:text-[#FAFAFA]">
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[#B91C1C] dark:text-[#EF4444] shrink-0" />
                <span>Everything in Standard Free</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[#B91C1C] dark:text-[#EF4444] shrink-0" />
                <span>Up to 250 MB per file upload</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[#B91C1C] dark:text-[#EF4444] shrink-0" />
                <span>Priority high-resolution OCR queue</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[#B91C1C] dark:text-[#EF4444] shrink-0" />
                <span>Batch redaction verification logs</span>
              </li>
            </ul>
          </div>
          <Link
            href="/contact"
            className="w-full py-2.5 px-4 text-center text-xs font-semibold text-white bg-[#B91C1C] hover:bg-[#7F1D1D] rounded-lg transition-colors shadow-xs"
          >
            Request Team Provisioning
          </Link>
        </div>

        {/* Self-Hosted / Enterprise */}
        <div className="p-6 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-xl flex flex-col justify-between space-y-6 shadow-2xs">
          <div className="space-y-4">
            <div className="text-xs font-mono text-[#71717A] dark:text-[#A1A1AA]">
              For regulated industries & on-premise setups
            </div>
            <h2 className="text-xl font-bold text-[#18181B] dark:text-[#FAFAFA]">
              Enterprise Self-Hosted
            </h2>
            <div className="text-3xl font-bold text-[#18181B] dark:text-[#FAFAFA] font-mono tabular-nums">
              Custom <span className="text-xs font-normal text-[#71717A] dark:text-[#A1A1AA]">/ annual</span>
            </div>
            <p className="text-xs text-[#52525B] dark:text-[#D4D4D8] leading-relaxed">
              Deploy PDFNestly inside your private VPC or air-gapped Kubernetes
              cluster with custom security controls.
            </p>
            <ul className="space-y-2.5 pt-4 border-t border-[#E4E4E7] dark:border-[#3F3F46] text-xs text-[#18181B] dark:text-[#FAFAFA]">
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[#B91C1C] dark:text-[#EF4444] shrink-0" />
                <span>100% private Docker / Cloud Run image</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[#B91C1C] dark:text-[#EF4444] shrink-0" />
                <span>Custom max file size configuration</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[#B91C1C] dark:text-[#EF4444] shrink-0" />
                <span>Single sign-on (SAML / OIDC) integration</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[#B91C1C] dark:text-[#EF4444] shrink-0" />
                <span>Dedicated SLA & engineering contact</span>
              </li>
            </ul>
          </div>
          <Link
            href="/contact"
            className="w-full py-2.5 px-4 text-center text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA] bg-white dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46] hover:border-[#B91C1C] rounded-lg transition-colors"
          >
            Contact Enterprise Engineering
          </Link>
        </div>
      </div>
    </div>
  );
}
