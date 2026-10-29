import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { ThemeProvider } from '@/components/ThemeProvider';
import { GoogleAnalytics } from '@/components/GoogleAnalytics';

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || 'https://pdfnestly.com'),
  title: {
    default: 'PDFNestly — Online PDF Editor, Converter, OCR & Document Suite',
    template: '%s | PDFNestly',
  },
  description:
    'Edit, merge, split, compress, sign, OCR, redact, convert to Word/Excel, and organize PDF documents online with PDFNestly.',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'PDFNestly — Online PDF Editor, Converter, OCR & Document Suite',
    description:
      'Edit, merge, split, compress, sign, OCR, redact, convert to Word/Excel, and organize PDF documents online with PDFNestly.',
    url: 'https://pdfnestly.com',
    siteName: 'PDFNestly',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PDFNestly — Online PDF Editor, Converter, OCR & Document Suite',
    description:
      'Edit, merge, split, compress, sign, OCR, redact, convert to Word/Excel, and organize PDF documents online with PDFNestly.',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'PDFNestly',
    url: 'https://pdfnestly.com',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'All',
    description:
      'Professional online PDF editor, converter, OCR engine, and document productivity platform supporting 30 PDF tools.',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
  };

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${plusJakarta.variable} ${jetbrainsMono.variable}`}
    >
      <body
        suppressHydrationWarning
        className="min-h-screen flex flex-col bg-[#FAFAFA] dark:bg-[#09090B] text-[#18181B] dark:text-[#FAFAFA] font-sans antialiased selection:bg-[#B91C1C] selection:text-white transition-colors duration-200"
      >
        <GoogleAnalytics />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <ThemeProvider>
          <Navbar />
          <main className="flex-1">{children}</main>
          <Footer />
        </ThemeProvider>
      </body>
    </html>
  );
}
