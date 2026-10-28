import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  PDF_TOOLS_REGISTRY,
  getToolBySlug,
  getToolsByCategory,
} from '@/lib/tools-registry';
import { PdfToolRunner } from '@/components/PdfToolRunner';

interface ToolPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return PDF_TOOLS_REGISTRY.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({
  params,
}: ToolPageProps): Promise<Metadata> {
  const { slug } = await params;
  const tool = getToolBySlug(slug);
  if (!tool) {
    return { title: 'Tool Not Found | PDFNestly' };
  }

  const canonicalUrl = `https://pdfnestly.com/${tool.slug}`;
  const cleanTitle = tool.metaTitle.replace(/\s*\|\s*PDFNestly$/i, '');

  return {
    title: cleanTitle,
    description: tool.metaDescription,
    alternates: {
      canonical: `/${tool.slug}`,
    },
    openGraph: {
      title: tool.metaTitle,
      description: tool.metaDescription,
      url: canonicalUrl,
      siteName: 'PDFNestly',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: tool.metaTitle,
      description: tool.metaDescription,
    },
  };
}

export default async function ToolLandingPage({ params }: ToolPageProps) {
  const { slug } = await params;
  const tool = getToolBySlug(slug);

  if (!tool) {
    notFound();
  }

  const relatedTools = getToolsByCategory(tool.category)
    .filter((t) => t.slug !== tool.slug)
    .slice(0, 4);

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: tool.faqs.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: f.answer,
      },
    })),
  };

  const isEditorRoute = tool.slug === 'edit-pdf' || tool.slug === 'sign-pdf';

  return (
    <div className="bg-[#FAFAFA] dark:bg-[#09090B] transition-colors">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      {isEditorRoute ? (
        <>
          <h1 className="sr-only">{tool.title}</h1>
          <div className="w-full">
            <PdfToolRunner tool={tool} />
          </div>
        </>
      ) : (
        <>
          {/* Breadcrumb & Tool Header */}
          <section className="bg-white dark:bg-[#18181B] border-b border-[#E4E4E7] dark:border-[#3F3F46]">
            <div className="max-w-7xl mx-auto px-6 py-8 space-y-3">
              <nav
                aria-label="Breadcrumb"
                className="flex items-center gap-2 text-xs text-[#71717A] dark:text-[#A1A1AA]"
              >
                <Link
                  href="/"
                  className="hover:text-[#18181B] dark:hover:text-[#FAFAFA] underline"
                >
                  Home
                </Link>
                <span aria-hidden="true">/</span>
                <Link
                  href="/tools"
                  className="hover:text-[#18181B] dark:hover:text-[#FAFAFA] underline"
                >
                  {tool.category}
                </Link>
                <span aria-hidden="true">/</span>
                <span className="text-[#18181B] dark:text-[#FAFAFA] font-medium">
                  {tool.shortTitle}
                </span>
              </nav>

              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="space-y-2 max-w-3xl">
                  <h1 className="text-2xl sm:text-3xl font-bold text-[#18181B] dark:text-[#FAFAFA] tracking-tight">
                    {tool.title}
                  </h1>
                  <p className="text-sm text-[#52525B] dark:text-[#D4D4D8] leading-relaxed">
                    {tool.summary}
                  </p>
                </div>
                <div className="text-xs text-[#71717A] dark:text-[#A1A1AA] font-mono shrink-0">
                  Tool #{String(tool.id).padStart(2, '0')} · /{tool.slug}
                </div>
              </div>
            </div>
          </section>

          {/* Main Tool Execution Workspace */}
          <div className="max-w-7xl mx-auto px-6 pt-10">
            <PdfToolRunner tool={tool} />
          </div>
        </>
      )}

      {/* Technical Documentation, Transparency Grid, FAQs, and Related Tools */}
      <div className="max-w-7xl mx-auto px-6 py-10 space-y-14">
        {/* How It Works + Technical Transparency Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-6 border-t border-[#E4E4E7] dark:border-[#3F3F46]">
          <div className="lg:col-span-7 space-y-4">
            <h2 className="text-lg font-bold text-[#18181B] dark:text-[#FAFAFA]">
              How to Use {tool.shortTitle}
            </h2>
            <ol className="space-y-3">
              {tool.steps.map((step, idx) => (
                <li
                  key={idx}
                  className="p-4 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-xl flex items-start gap-3 text-xs text-[#18181B] dark:text-[#FAFAFA] leading-relaxed shadow-2xs"
                >
                  <span className="font-mono font-bold text-[#B91C1C] dark:text-[#EF4444] shrink-0">
                    0{idx + 1}.
                  </span>
                  <span className="text-[#52525B] dark:text-[#D4D4D8]">{step}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="lg:col-span-5 space-y-4">
            <h2 className="text-lg font-bold text-[#18181B] dark:text-[#FAFAFA]">
              Document Processing & Privacy Notes
            </h2>
            <div className="p-5 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-xl space-y-3 text-xs text-[#52525B] dark:text-[#D4D4D8] leading-relaxed shadow-2xs">
              <div>
                <strong className="text-[#18181B] dark:text-[#FAFAFA] block mb-0.5">
                  Processing Mode:
                </strong>
                <span className="font-mono text-[#B91C1C] dark:text-[#EF4444]">
                  {tool.engineLabel}
                </span>
              </div>
              <div>
                <strong className="text-[#18181B] dark:text-[#FAFAFA] block mb-0.5">
                  Specifications & Quality:
                </strong>
                <p>{tool.technicalNotice}</p>
              </div>
              <div>
                <strong className="text-[#18181B] dark:text-[#FAFAFA] block mb-0.5">
                  Document Privacy:
                </strong>
                <p>{tool.privacyDisclosure}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Frequently Asked Questions */}
        <section className="space-y-4 pt-6 border-t border-[#E4E4E7] dark:border-[#3F3F46]">
          <h2 className="text-lg font-bold text-[#18181B] dark:text-[#FAFAFA]">
            Frequently Asked Questions — {tool.shortTitle}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {tool.faqs.map((faq, idx) => (
              <div
                key={idx}
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
        </section>

        {/* Related PDF Tools in Same Category */}
        {relatedTools.length > 0 && (
          <section className="space-y-4 pt-6 border-t border-[#E4E4E7] dark:border-[#3F3F46]">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-[#18181B] dark:text-[#FAFAFA]">
                Related {tool.category} Tools
              </h2>
              <Link
                href="/tools"
                className="text-xs font-semibold text-[#B91C1C] dark:text-[#EF4444] hover:underline"
              >
                View All 30 Tools →
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {relatedTools.map((rel) => (
                <Link
                  key={rel.slug}
                  href={`/${rel.slug}`}
                  className="p-4 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] hover:border-[#B91C1C] dark:hover:border-[#EF4444] rounded-xl transition-colors space-y-1.5 shadow-2xs hover:shadow-xs"
                >
                  <div className="text-xs font-mono text-[#71717A] dark:text-[#A1A1AA]">
                    /{rel.slug}
                  </div>
                  <div className="text-sm font-bold text-[#18181B] dark:text-[#FAFAFA]">
                    {rel.shortTitle}
                  </div>
                  <p className="text-xs text-[#52525B] dark:text-[#D4D4D8] line-clamp-2">
                    {rel.summary}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
