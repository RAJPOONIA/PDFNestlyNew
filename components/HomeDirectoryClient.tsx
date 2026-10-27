'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Search,
  ArrowRight,
  Layers,
  Sliders,
  PenTool,
  FileInput,
  FileOutput,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import {
  PDF_TOOLS_REGISTRY,
  TOOL_CATEGORIES,
  ToolCategory,
} from '@/lib/tools-registry';

function getCategoryIcon(category: ToolCategory) {
  switch (category) {
    case 'Organize & Pages':
      return <Layers className="w-4 h-4 text-[#B91C1C] dark:text-[#EF4444] shrink-0" />;
    case 'Optimize & Repair':
      return <Sliders className="w-4 h-4 text-[#B91C1C] dark:text-[#EF4444] shrink-0" />;
    case 'Edit & Annotate':
      return <PenTool className="w-4 h-4 text-[#B91C1C] dark:text-[#EF4444] shrink-0" />;
    case 'Sign & Security':
      return <ShieldCheck className="w-4 h-4 text-[#B91C1C] dark:text-[#EF4444] shrink-0" />;
    case 'Convert & Export':
      return <FileOutput className="w-4 h-4 text-[#B91C1C] dark:text-[#EF4444] shrink-0" />;
    case 'OCR, Extract & Compare':
      return <FileInput className="w-4 h-4 text-[#B91C1C] dark:text-[#EF4444] shrink-0" />;
  }
}

export function HomeDirectoryClient() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<ToolCategory | 'ALL'>(() => {
    if (typeof window !== 'undefined') {
      try {
        const params = new URLSearchParams(window.location.search);
        const cat = params.get('cat');
        if (cat && TOOL_CATEGORIES.includes(cat as ToolCategory)) {
          return cat as ToolCategory;
        }
      } catch {
        // Ignore URL search error
      }
    }
    return 'ALL';
  });

  const [recentSlugs, setRecentSlugs] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('pdfnestly_recent_tools');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            return parsed.slice(0, 5);
          }
        }
      } catch {
        // Ignore storage access error
      }
    }
    return [];
  });

  const [quickSelectedSlug, setQuickSelectedSlug] =
    useState<string>('edit-pdf');

  const recordToolVisit = (slug: string) => {
    try {
      const next = [slug, ...recentSlugs.filter((s) => s !== slug)].slice(0, 5);
      setRecentSlugs(next);
      localStorage.setItem('pdfnestly_recent_tools', JSON.stringify(next));
    } catch {
      // Ignore storage errors
    }
  };

  const filteredTools = PDF_TOOLS_REGISTRY.filter((tool) => {
    const matchesCategory =
      selectedCategory === 'ALL' || tool.category === selectedCategory;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return matchesCategory;
    return (
      matchesCategory &&
      (tool.title.toLowerCase().includes(q) ||
        tool.shortTitle.toLowerCase().includes(q) ||
        tool.summary.toLowerCase().includes(q) ||
        tool.slug.toLowerCase().includes(q))
    );
  });

  const recentTools = recentSlugs
    .map((slug) => PDF_TOOLS_REGISTRY.find((t) => t.slug === slug))
    .filter((t): t is NonNullable<typeof t> => Boolean(t));

  return (
    <div className="max-w-7xl mx-auto px-6 py-6 space-y-12">
      {/* Quick-Launch Bar */}
      <div className="bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-xl p-6 sm:p-8 shadow-xs">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          <div className="lg:col-span-7 space-y-2">
            <div className="text-xs font-medium text-[#71717A] dark:text-[#A1A1AA]">
              Fast Browser & Server Execution · No Account Required
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-[#18181B] dark:text-[#FAFAFA] tracking-tight">
              Launch Any PDF Workflow
            </h2>
            <p className="text-sm text-[#52525B] dark:text-[#D4D4D8] leading-relaxed">
              Select any of our 30 tools to open its dedicated workspace, upload your
              own document, or test instantly with a 1-click sample file.
            </p>
          </div>

          <div className="lg:col-span-5 bg-[#FAFAFA] dark:bg-[#27272A] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-xl p-4 space-y-3 min-w-0">
            <label
              htmlFor="quick-tool-selector"
              className="block text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA]"
            >
              Quick-Launch Tool Selector
            </label>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 min-w-0">
              <select
                id="quick-tool-selector"
                value={quickSelectedSlug}
                onChange={(e) => setQuickSelectedSlug(e.target.value)}
                className="flex-1 min-w-0 w-full px-3 py-2.5 text-xs font-medium bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg text-[#18181B] dark:text-[#FAFAFA] focus:outline-none focus:ring-2 focus:ring-[#B91C1C]"
              >
                {PDF_TOOLS_REGISTRY.map((t) => (
                  <option key={t.slug} value={t.slug}>
                    {t.id}. {t.shortTitle} — {t.category}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  recordToolVisit(quickSelectedSlug);
                  router.push(`/${quickSelectedSlug}`);
                }}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-[#B91C1C] hover:bg-[#7F1D1D] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
              >
                <span>Open Tool</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-[#71717A] dark:text-[#A1A1AA]">
              <Link
                href="/edit-pdf"
                onClick={() => recordToolVisit('edit-pdf')}
                className="text-[#B91C1C] dark:text-[#EF4444] hover:underline font-medium inline-flex items-center gap-1"
              >
                <Sparkles className="w-3 h-3" />
                Open Interactive PDF Editor
              </Link>
              <span className="hidden sm:inline">·</span>
              <Link
                href="/merge-pdf"
                onClick={() => recordToolVisit('merge-pdf')}
                className="hover:text-[#18181B] dark:hover:text-[#FAFAFA] underline"
              >
                Merge PDFs
              </Link>
              <span className="hidden sm:inline">·</span>
              <Link
                href="/compress-pdf"
                onClick={() => recordToolVisit('compress-pdf')}
                className="hover:text-[#18181B] dark:hover:text-[#FAFAFA] underline"
              >
                Compress PDF
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Recently Used Tools (if any) */}
      {recentTools.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#71717A] dark:text-[#A1A1AA]">
              Recently Used Tools
            </h3>
            <button
              type="button"
              onClick={() => {
                setRecentSlugs([]);
                localStorage.removeItem('pdfnestly_recent_tools');
              }}
              className="text-xs text-[#71717A] dark:text-[#A1A1AA] hover:text-[#18181B] dark:hover:text-[#FAFAFA] underline"
            >
              Clear history
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {recentTools.map((tool) => (
              <Link
                key={tool.slug}
                href={`/${tool.slug}`}
                className="p-3.5 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] hover:border-[#B91C1C] dark:hover:border-[#EF4444] rounded-lg transition-colors flex items-center justify-between shadow-2xs"
              >
                <span className="text-xs font-semibold text-[#18181B] dark:text-[#FAFAFA] truncate">
                  {tool.shortTitle}
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-[#B91C1C] dark:text-[#EF4444] shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Search & Categorized 30-Tool Directory */}
      <section id="tools-directory" className="space-y-6 scroll-mt-24">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-2xl font-bold text-[#18181B] dark:text-[#FAFAFA] tracking-tight">
              Complete 30-Tool PDF Directory
            </h2>
            <p className="text-sm text-[#52525B] dark:text-[#D4D4D8]">
              Filter by category or search by document operation.
            </p>
          </div>

          {/* Search Input */}
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-[#71717A] dark:text-[#A1A1AA] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              aria-label="Search PDF tools"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tools (e.g. OCR, redact, split, docx)..."
              className="w-full pl-9 pr-4 py-2 text-xs bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-lg text-[#18181B] dark:text-[#FAFAFA] placeholder:text-[#71717A] dark:placeholder:text-[#A1A1AA] focus:outline-none focus:ring-2 focus:ring-[#B91C1C]"
            />
          </div>
        </div>

        {/* Interactive Category Filter Segmented Control */}
        <div
          role="tablist"
          aria-label="Filter tools by category"
          className="flex flex-wrap items-center gap-1.5 p-1.5 bg-white dark:bg-[#18181B] rounded-xl border border-[#E4E4E7] dark:border-[#3F3F46]"
        >
          <button
            type="button"
            role="tab"
            aria-selected={selectedCategory === 'ALL'}
            onClick={() => setSelectedCategory('ALL')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              selectedCategory === 'ALL'
                ? 'bg-[#B91C1C] text-white shadow-xs'
                : 'text-[#52525B] dark:text-[#D4D4D8] hover:text-[#18181B] dark:hover:text-[#FAFAFA] hover:bg-[#F4F4F5] dark:hover:bg-[#27272A]'
            }`}
          >
            All Tools ({PDF_TOOLS_REGISTRY.length})
          </button>
          {TOOL_CATEGORIES.map((cat) => {
            const count = PDF_TOOLS_REGISTRY.filter(
              (t) => t.category === cat
            ).length;
            return (
              <button
                key={cat}
                type="button"
                role="tab"
                aria-selected={selectedCategory === cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-[#B91C1C] text-white shadow-xs'
                    : 'text-[#52525B] dark:text-[#D4D4D8] hover:text-[#18181B] dark:hover:text-[#FAFAFA] hover:bg-[#F4F4F5] dark:hover:bg-[#27272A]'
                }`}
              >
                {cat} ({count})
              </button>
            );
          })}
        </div>

        {/* Tools Grid */}
        {filteredTools.length === 0 ? (
          <div className="p-12 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] rounded-xl text-center space-y-3">
            <p className="text-sm font-semibold text-[#18181B] dark:text-[#FAFAFA]">
              No PDF tools matched &ldquo;{searchQuery}&rdquo;.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('ALL');
              }}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#B91C1C] hover:bg-[#7F1D1D] rounded-lg cursor-pointer"
            >
              Reset Search & Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTools.map((tool) => (
              <Link
                key={tool.slug}
                href={`/${tool.slug}`}
                onClick={() => recordToolVisit(tool.slug)}
                className="group p-5 bg-white dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#3F3F46] hover:border-[#B91C1C] dark:hover:border-[#EF4444] rounded-xl transition-all flex flex-col justify-between space-y-4 shadow-2xs hover:shadow-xs"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-xs text-[#71717A] dark:text-[#A1A1AA]">
                    <span className="font-mono tabular-nums">
                      #{String(tool.id).padStart(2, '0')} · {tool.category}
                    </span>
                    <span className="font-medium text-[#71717A] dark:text-[#A1A1AA]">
                      {tool.processingLocation === 'local-browser'
                        ? 'Local Browser'
                        : 'Server Ghostscript'}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-[#18181B] dark:text-[#FAFAFA] group-hover:text-[#B91C1C] dark:group-hover:text-[#EF4444] transition-colors flex items-center gap-2.5">
                    {getCategoryIcon(tool.category)}
                    <span>{tool.shortTitle}</span>
                  </h3>

                  <p className="text-xs text-[#52525B] dark:text-[#D4D4D8] leading-relaxed">
                    {tool.summary}
                  </p>
                </div>

                <div className="pt-3 border-t border-[#E4E4E7] dark:border-[#3F3F46] flex items-center justify-between text-xs font-semibold text-[#B91C1C] dark:text-[#EF4444]">
                  <span>Launch /{tool.slug}</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default HomeDirectoryClient;
