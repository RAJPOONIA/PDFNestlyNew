import Link from 'next/link';
import {
  Layers,
  Scissors,
  FileDown,
  PenTool,
  FileText,
  CheckCircle,
  Image as ImageIcon,
  ScanText,
  ArrowRight,
  ShieldCheck,
  FolderKanban,
  FileSpreadsheet,
  Lock,
  SearchCheck,
  HelpCircle,
} from 'lucide-react';
import { HomeHeroUpload } from '@/components/HomeHeroUpload';

export default function HomePage() {
  const popularTools = [
    {
      slug: 'merge-pdf',
      title: 'Merge PDF',
      description: 'Combine multiple PDF documents into a single organized file.',
      icon: Layers,
    },
    {
      slug: 'split-pdf',
      title: 'Split PDF',
      description: 'Extract specific page ranges or burst pages into separate files.',
      icon: Scissors,
    },
    {
      slug: 'compress-pdf',
      title: 'Compress PDF',
      description: 'Reduce file size efficiently while maintaining sharp text and graphics.',
      icon: FileDown,
    },
    {
      slug: 'edit-pdf',
      title: 'Edit PDF',
      description: 'Add text overlays, drawings, stamps, notes, and highlights.',
      icon: PenTool,
    },
    {
      slug: 'pdf-to-word',
      title: 'PDF to Word',
      description: 'Convert PDF documents into editable Microsoft Word (.docx) files.',
      icon: FileText,
    },
    {
      slug: 'sign-pdf',
      title: 'Sign PDF',
      description: 'Draw, type, or upload an electronic signature to sign agreements.',
      icon: CheckCircle,
    },
    {
      slug: 'jpg-to-pdf',
      title: 'Image to PDF',
      description: 'Convert JPG, PNG, and WebP images into a clean PDF document.',
      icon: ImageIcon,
    },
    {
      slug: 'ocr-pdf',
      title: 'OCR PDF',
      description: 'Recognize scanned text and produce a searchable PDF layer.',
      icon: ScanText,
    },
  ];

  const categories = [
    {
      name: 'Edit PDF',
      description: 'Add text, annotations, watermarks, and page numbers.',
      href: '/tools?cat=Edit+%26+Annotate',
      icon: PenTool,
    },
    {
      name: 'Organize PDF',
      description: 'Merge, split, rotate, crop, and reorder document pages.',
      href: '/tools?cat=Organize+%26+Pages',
      icon: FolderKanban,
    },
    {
      name: 'Convert PDF',
      description: 'Convert between PDF and Word, Excel, CSV, or image formats.',
      href: '/tools?cat=Convert+%26+Export',
      icon: FileSpreadsheet,
    },
    {
      name: 'Compress PDF',
      description: 'Optimize file size with tailored resolution profiles.',
      href: '/compress-pdf',
      icon: FileDown,
    },
    {
      name: 'Protect PDF',
      description: 'Add password encryption, manage permissions, or remove locks.',
      href: '/protect-pdf',
      icon: Lock,
    },
    {
      name: 'Sign PDF',
      description: 'Create and place signatures on contracts and forms.',
      href: '/sign-pdf',
      icon: CheckCircle,
    },
    {
      name: 'OCR and Extract',
      description: 'Extract text transcripts and tables from scanned documents.',
      href: '/ocr-pdf',
      icon: ScanText,
    },
    {
      name: 'Compare and Repair',
      description: 'Inspect differences between two PDFs or repair damaged xref files.',
      href: '/compare-pdf',
      icon: SearchCheck,
    },
  ];

  const faqs = [
    {
      question: 'How do I edit a PDF online?',
      answer:
        'Open the PDF Editor tool, load your PDF document, and use the toolbar to place text overlays, comments, shapes, stamps, or signatures anywhere on the canvas. When finished, click Export to download your updated file.',
    },
    {
      question: 'Can I merge or split PDF files?',
      answer:
        'Yes. With Merge PDF you can drag and reorder multiple PDF documents into one unified file. With Split PDF you can extract chosen page numbers, split by ranges, or burst every page into individual PDFs.',
    },
    {
      question: 'Are my PDF files processed locally or on a server?',
      answer:
        'Most tools execute directly inside your web browser using modern client-side processing, meaning your documents never leave your device. Specialized tasks requiring dedicated processing (such as high-ratio file compression and document structure repair) execute in isolated temporary environments and are permanently deleted immediately after processing.',
    },
    {
      question: 'How can I find all available PDF tools?',
      answer:
        'Visit our All Tools directory or click "Explore All Tools" to view, search, and filter all 30 genuine PDF tools categorized by workflow.',
    },
  ];

  return (
    <div className="bg-[#FAFAFA] dark:bg-[#09090B] transition-colors">
      {/* Hero Section */}
      <section className="border-b border-[#E4E4E7] dark:border-[#3F3F46] bg-gradient-to-b from-white to-[#FAFAFA] dark:from-[#18181B] dark:to-[#09090B] py-16 sm:py-20">
        <div className="max-w-5xl mx-auto px-6 text-center space-y-8">
          <div className="space-y-3">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-[#18181B] dark:text-[#FAFAFA] tracking-tight leading-[1.12] [text-wrap:balance]">
              Everything You Need to Work with PDFs
            </h1>
            <p className="text-base sm:text-lg text-[#52525B] dark:text-[#D4D4D8] max-w-2xl mx-auto leading-relaxed">
              Edit, merge, split, compress, convert, and organize PDF files with
              simple online tools.
            </p>
          </div>

          {/* Prominent Upload Area with Drag-and-Drop */}
          <HomeHeroUpload />
        </div>
      </section>

      {/* Popular PDF Tools Section (No more than 8 tools) */}
      <section className="py-16 sm:py-20 border-b border-[#E4E4E7] dark:border-[#3F3F46]">
        <div className="max-w-7xl mx-auto px-6 space-y-10">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-2xl sm:text-3xl font-bold text-[#18181B] dark:text-[#FAFAFA] tracking-tight">
                Popular PDF Tools
              </h2>
              <p className="text-sm text-[#52525B] dark:text-[#D4D4D8]">
                Fast, reliable tools for your most frequent document tasks.
              </p>
            </div>
            <Link
              href="/tools"
              className="text-xs font-semibold text-[#B91C1C] dark:text-[#EF4444] hover:underline inline-flex items-center gap-1 shrink-0"
            >
              <span>Explore All Tools</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {popularTools.map((tool) => {
              const Icon = tool.icon;
              return (
                <Link
                  key={tool.slug}
                  href={`/${tool.slug}`}
                  className="group p-5 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] hover:border-[#B91C1C] dark:hover:border-[#EF4444] rounded-xl transition-all flex flex-col justify-between space-y-4 shadow-2xs hover:shadow-xs"
                >
                  <div className="space-y-3">
                    <div className="w-10 h-10 rounded-lg bg-[#FEF2F2] dark:bg-[#B91C1C]/15 border border-[#B91C1C]/20 flex items-center justify-center text-[#B91C1C] dark:text-[#EF4444] group-hover:scale-105 transition-transform">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-[#18181B] dark:text-[#FAFAFA] group-hover:text-[#B91C1C] dark:group-hover:text-[#EF4444] transition-colors">
                        {tool.title}
                      </h3>
                      <p className="text-xs text-[#52525B] dark:text-[#D4D4D8] leading-relaxed mt-1">
                        {tool.description}
                      </p>
                    </div>
                  </div>

                  <div className="pt-2 flex items-center text-xs font-semibold text-[#B91C1C] dark:text-[#EF4444]">
                    <span>Use tool</span>
                    <ArrowRight className="w-3.5 h-3.5 ml-1 group-hover:translate-x-1 transition-transform" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Browse Tool Categories Section */}
      <section className="py-16 sm:py-20 bg-white dark:bg-[#18181B] border-b border-[#E4E4E7] dark:border-[#3F3F46]">
        <div className="max-w-7xl mx-auto px-6 space-y-10">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-2xl sm:text-3xl font-bold text-[#18181B] dark:text-[#FAFAFA] tracking-tight">
                Browse by Category
              </h2>
              <p className="text-sm text-[#52525B] dark:text-[#D4D4D8]">
                Find the right tool for editing, organizing, converting, or protecting documents.
              </p>
            </div>
            <Link
              href="/tools"
              className="text-xs font-semibold text-[#B91C1C] dark:text-[#EF4444] hover:underline inline-flex items-center gap-1 shrink-0"
            >
              <span>View All 30 Tools</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {categories.map((cat) => {
              const Icon = cat.icon;
              return (
                <Link
                  key={cat.name}
                  href={cat.href}
                  className="p-5 rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46] bg-[#FAFAFA] dark:bg-[#27272A] hover:bg-white dark:hover:bg-[#18181B] hover:border-[#B91C1C] dark:hover:border-[#EF4444] transition-all group shadow-2xs"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <Icon className="w-4 h-4 text-[#B91C1C] dark:text-[#EF4444]" />
                    <h3 className="text-sm font-bold text-[#18181B] dark:text-[#FAFAFA] group-hover:text-[#B91C1C] dark:group-hover:text-[#EF4444] transition-colors">
                      {cat.name}
                    </h3>
                  </div>
                  <p className="text-xs text-[#52525B] dark:text-[#D4D4D8] leading-relaxed">
                    {cat.description}
                  </p>
                </Link>
              );
            })}
          </div>

          <div className="text-center pt-4">
            <Link
              href="/tools"
              className="inline-flex items-center gap-2 px-6 py-3 text-xs font-semibold text-white bg-[#B91C1C] hover:bg-[#7F1D1D] rounded-lg transition-colors shadow-xs"
            >
              <span>Explore All 30 Tools</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-16 sm:py-20 border-b border-[#E4E4E7] dark:border-[#3F3F46]">
        <div className="max-w-5xl mx-auto px-6 space-y-12">
          <div className="text-center space-y-2">
            <h2 className="text-2xl sm:text-3xl font-bold text-[#18181B] dark:text-[#FAFAFA] tracking-tight">
              How It Works
            </h2>
            <p className="text-sm text-[#52525B] dark:text-[#D4D4D8]">
              Get your document tasks done in three straightforward steps.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-xl space-y-3 shadow-2xs">
              <div className="w-8 h-8 rounded-lg bg-[#FEF2F2] dark:bg-[#B91C1C]/15 border border-[#B91C1C]/20 flex items-center justify-center font-mono font-bold text-xs text-[#B91C1C] dark:text-[#EF4444]">
                1
              </div>
              <h3 className="text-base font-bold text-[#18181B] dark:text-[#FAFAFA]">
                Upload Your PDF
              </h3>
              <p className="text-xs text-[#52525B] dark:text-[#D4D4D8] leading-relaxed">
                Choose any PDF document or image file from your device, or drag and drop it directly onto the workspace.
              </p>
            </div>

            <div className="p-6 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-xl space-y-3 shadow-2xs">
              <div className="w-8 h-8 rounded-lg bg-[#FEF2F2] dark:bg-[#B91C1C]/15 border border-[#B91C1C]/20 flex items-center justify-center font-mono font-bold text-xs text-[#B91C1C] dark:text-[#EF4444]">
                2
              </div>
              <h3 className="text-base font-bold text-[#18181B] dark:text-[#FAFAFA]">
                Choose & Configure
              </h3>
              <p className="text-xs text-[#52525B] dark:text-[#D4D4D8] leading-relaxed">
                Select your tool and adjust options such as page ranges, compression level, text overlays, or conversion format.
              </p>
            </div>

            <div className="p-6 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-xl space-y-3 shadow-2xs">
              <div className="w-8 h-8 rounded-lg bg-[#FEF2F2] dark:bg-[#B91C1C]/15 border border-[#B91C1C]/20 flex items-center justify-center font-mono font-bold text-xs text-[#B91C1C] dark:text-[#EF4444]">
                3
              </div>
              <h3 className="text-base font-bold text-[#18181B] dark:text-[#FAFAFA]">
                Process & Download
              </h3>
              <p className="text-xs text-[#52525B] dark:text-[#D4D4D8] leading-relaxed">
                Click run to instantly execute the operation, review the summary, and download your processed result.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Privacy and Security Section */}
      <section className="py-16 sm:py-20 bg-white dark:bg-[#18181B] border-b border-[#E4E4E7] dark:border-[#3F3F46]">
        <div className="max-w-4xl mx-auto px-6 space-y-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#FEF2F2] dark:bg-[#B91C1C]/15 border border-[#B91C1C]/20 flex items-center justify-center text-[#B91C1C] dark:text-[#EF4444] shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-[#18181B] dark:text-[#FAFAFA] tracking-tight">
                Privacy & Document Security
              </h2>
              <p className="text-xs text-[#71717A] dark:text-[#A1A1AA]">
                Transparent document handling designed to protect your data.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-[#52525B] dark:text-[#D4D4D8] leading-relaxed">
            <div className="p-5 bg-[#FAFAFA] dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-xl space-y-2">
              <h3 className="font-bold text-sm text-[#18181B] dark:text-[#FAFAFA]">
                Private In-Browser Processing
              </h3>
              <p>
                The vast majority of PDFNestly tools (such as merging, splitting,
                annotating, page rotation, and image conversion) execute locally
                inside your web browser. Your files never leave your computer or
                mobile device during these operations.
              </p>
            </div>

            <div className="p-5 bg-[#FAFAFA] dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-xl space-y-2">
              <h3 className="font-bold text-sm text-[#18181B] dark:text-[#FAFAFA]">
                Secure Ephemeral Processing
              </h3>
              <p>
                For tasks requiring dedicated processing (such as high-ratio
                stream compression and document repair), files are handled in
                isolated temporary environments and permanently deleted
                immediately after the operation finishes.
              </p>
            </div>
          </div>

          <div className="pt-2">
            <Link
              href="/privacy"
              className="text-xs font-semibold text-[#B91C1C] dark:text-[#EF4444] hover:underline inline-flex items-center gap-1"
            >
              <span>Read our full Privacy & File Retention Policy</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Compact FAQ Section */}
      <section className="py-16 sm:py-20">
        <div className="max-w-4xl mx-auto px-6 space-y-10">
          <div className="text-center space-y-2">
            <div className="w-9 h-9 mx-auto rounded-lg bg-[#FEF2F2] dark:bg-[#B91C1C]/15 border border-[#B91C1C]/20 flex items-center justify-center text-[#B91C1C] dark:text-[#EF4444]">
              <HelpCircle className="w-5 h-5" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-[#18181B] dark:text-[#FAFAFA] tracking-tight">
              Frequently Asked Questions
            </h2>
            <p className="text-sm text-[#52525B] dark:text-[#D4D4D8]">
              Quick answers about using PDFNestly.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {faqs.map((faq, i) => (
              <div
                key={i}
                className="p-5 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-xl space-y-2 shadow-2xs"
              >
                <h3 className="text-sm font-bold text-[#18181B] dark:text-[#FAFAFA]">
                  {faq.question}
                </h3>
                <p className="text-xs text-[#52525B] dark:text-[#D4D4D8] leading-relaxed">
                  {faq.answer}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
