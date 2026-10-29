'use client';

import React, { Suspense, useEffect, useRef } from 'react';
import Script from 'next/script';
import { usePathname, useSearchParams } from 'next/navigation';

export const GA_MEASUREMENT_ID =
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || 'G-MSPZRXHB28';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function GoogleAnalyticsPageViewTracker({
  measurementId,
}: {
  measurementId: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastTrackedPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname) return;
    const queryString = searchParams?.toString();
    const currentPagePath = queryString ? `${pathname}?${queryString}` : pathname;

    // The initial page_view is sent once by the inline gtag('config', ...) script.
    // Record the initial path on first mount so React StrictMode or hydration
    // never dispatches a duplicate page_view event.
    if (lastTrackedPathRef.current === null) {
      lastTrackedPathRef.current = currentPagePath;
      return;
    }

    if (lastTrackedPathRef.current === currentPagePath) {
      return;
    }

    lastTrackedPathRef.current = currentPagePath;

    if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
      window.gtag('config', measurementId, {
        page_path: currentPagePath,
        page_title: document.title,
        page_location: window.location.href,
      });
    }
  }, [pathname, searchParams, measurementId]);

  return null;
}

export function GoogleAnalytics({
  measurementId = GA_MEASUREMENT_ID,
}: {
  measurementId?: string;
}) {
  if (!measurementId) return null;

  return (
    <>
      <Script
        id="google-analytics-gtag"
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
        strategy="afterInteractive"
      />
      <Script
        id="google-analytics-init"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            window.gtag = gtag;
            gtag('js', new Date());
            gtag('config', '${measurementId}', {
              page_path: window.location.pathname + window.location.search
            });
          `,
        }}
      />
      <Suspense fallback={null}>
        <GoogleAnalyticsPageViewTracker measurementId={measurementId} />
      </Suspense>
    </>
  );
}
