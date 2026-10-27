import { Metadata } from 'next';
import { HomeDirectoryClient } from '@/components/HomeDirectoryClient';

export const metadata: Metadata = {
  title: 'All PDF Tools Directory — 30 Fast & Secure Online Utilities | PDFNestly',
  description:
    'Browse all 30 genuine online PDF tools. Merge, split, compress, edit, convert, sign, OCR, and organize documents with local WebAssembly processing.',
  alternates: {
    canonical: 'https://pdfnestly.com/tools',
  },
};

export default function ToolsDirectoryPage() {
  return (
    <div className="py-8 md:py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-8 text-center">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-[#18181B] dark:text-[#FAFAFA] tracking-tight">
          All PDF Tools Directory
        </h1>
        <p className="mt-3 text-base sm:text-lg text-[#52525B] dark:text-[#D4D4D8] max-w-2xl mx-auto">
          Explore all 30 genuine PDF productivity tools. Categorized, searchable, and powered by fast client-side processing.
        </p>
      </div>

      <HomeDirectoryClient />
    </div>
  );
}
