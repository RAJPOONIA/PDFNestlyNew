import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Help, Technical Documentation & Open-Source Licenses',
  description:
    'Technical documentation, system dependencies, deployment instructions, and open-source library licenses for PDFNestly.',
  alternates: { canonical: '/help' },
};

export default function HelpPage() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-14 space-y-12">
      <div className="space-y-3 border-b border-[#E4E4E7] dark:border-[#3F3F46] pb-6">
        <h1 className="text-3xl font-bold text-[#18181B] dark:text-[#FAFAFA] tracking-tight">
          Help, Technical Documentation & Licenses
        </h1>
        <p className="text-sm text-[#52525B] dark:text-[#D4D4D8] leading-relaxed">
          Reference for running, testing, and understanding PDFNestly document
          engines and third-party library licenses.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-bold text-[#18181B] dark:text-[#FAFAFA]">
          1. System Dependencies & Open-Source Licenses
        </h2>
        <div className="overflow-x-auto bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-xl shadow-2xs">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#FAFAFA] dark:bg-[#27272A] border-b border-[#E4E4E7] dark:border-[#3F3F46] text-[#18181B] dark:text-[#FAFAFA] font-semibold">
                <th className="py-3 px-4">Library / Binary</th>
                <th className="py-3 px-4">License</th>
                <th className="py-3 px-4">Role in PDFNestly</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E4E7] dark:divide-[#3F3F46] text-[#52525B] dark:text-[#D4D4D8]">
              <tr>
                <td className="py-2.5 px-4 font-mono text-[#18181B] dark:text-[#FAFAFA]">pdf-lib (^1.17.1)</td>
                <td className="py-2.5 px-4">MIT</td>
                <td className="py-2.5 px-4">
                  Page tree manipulation, merging, splitting, cropping, AcroForms, vector text & image embedding
                </td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-mono text-[#18181B] dark:text-[#FAFAFA]">pdfjs-dist (^4.x)</td>
                <td className="py-2.5 px-4">Apache-2.0</td>
                <td className="py-2.5 px-4">
                  High-DPI canvas page rendering, thumbnail generation, coordinate text & table extraction
                </td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-mono text-[#18181B] dark:text-[#FAFAFA]">tesseract.js (^5.x)</td>
                <td className="py-2.5 px-4">Apache-2.0</td>
                <td className="py-2.5 px-4">
                  WebAssembly Optical Character Recognition & searchable text layer creation
                </td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-mono text-[#18181B] dark:text-[#FAFAFA]">docx (^9.x) & mammoth</td>
                <td className="py-2.5 px-4">MIT / BSD-2-Clause</td>
                <td className="py-2.5 px-4">
                  Word document (.docx) generation and Word-to-PDF parsing
                </td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-mono text-[#18181B] dark:text-[#FAFAFA]">xlsx & jszip</td>
                <td className="py-2.5 px-4">Apache-2.0 / MIT</td>
                <td className="py-2.5 px-4">
                  Spreadsheet (.xlsx/.csv) table export and multi-file ZIP archive compression
                </td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-mono text-[#18181B] dark:text-[#FAFAFA]">Ghostscript (gs 9.55)</td>
                <td className="py-2.5 px-4">AGPLv3</td>
                <td className="py-2.5 px-4">
                  Server-side stream compression, password encryption/decryption, xref repair, and prepress
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-[#18181B] dark:text-[#FAFAFA]">
          2. Commands to Run, Test & Build
        </h2>
        <pre className="p-4 bg-[#18181B] dark:bg-[#18181B] border border-[#3F3F46] text-[#FAFAFA] rounded-xl text-xs font-mono overflow-x-auto leading-relaxed">
{`# Install dependencies
npm install

# Run fast unit & integration tests (Node built-in test runner via tsx)
npx --yes tsx --test lib/pdf-utils.test.ts lib/sample-pdf.test.ts lib/pdf-operations.test.ts

# Run linting & TypeScript production build
npm run lint
npm run build

# Start production server on port 3000
npm run start`}
        </pre>
      </section>

      <div className="pt-4">
        <Link
          href="/contact"
          className="inline-flex items-center px-5 py-2.5 text-xs font-semibold text-white bg-[#B91C1C] hover:bg-[#7F1D1D] rounded-lg transition-colors shadow-xs"
        >
          Need Help? Contact Engineering Support →
        </Link>
      </div>
    </div>
  );
}
