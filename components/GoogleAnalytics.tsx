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

const SENSITIVE_QUERY_KEYS = new Set([
  'token',
  'resettoken',
  'verificationtoken',
  'oobcode',
  'code',
  'key',
  'secret',
  'password',
  'email',
]);

export function sanitizeAnalyticsSearchParams(rawSearch: string): string {
  if (!rawSearch) return '';
  const params = new URLSearchParams(
    rawSearch.startsWith('?') ? rawSearch.slice(1) : rawSearch
  );
  for (const key of Array.from(params.keys())) {
    if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
      params.delete(key);
    }
  }
  return params.toString();
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
    const rawQueryString = searchParams?.toString() || '';
    const sanitizedQuery = sanitizeAnalyticsSearchParams(rawQueryString);
    const currentPagePath = sanitizedQuery
      ? `${pathname}?${sanitizedQuery}`
      : pathname;

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
      const safeLocation = `${window.location.origin}${currentPagePath}`;
      window.gtag('config', measurementId, {
        page_path: currentPagePath,
        page_title: document.title,
        page_location: safeLocation,
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
            (function() {
              var params = new URLSearchParams(window.location.search || '');
              ['token','resettoken','verificationtoken','oobcode','code','key','secret','password','email'].forEach(function(k) {
                Array.from(params.keys()).forEach(function(actualKey) {
                  if (actualKey.toLowerCase() === k) params.delete(actualKey);
                });
              });
              var qs = params.toString();
              var safePath = window.location.pathname + (qs ? '?' + qs : '');
              gtag('config', '${measurementId}', {
                page_path: safePath,
                page_location: window.location.origin + safePath
              });
            })();
          `,
        }}
      />
      <Suspense fallback={null}>
        <GoogleAnalyticsPageViewTracker measurementId={measurementId} />
      </Suspense>
    </>
  );
}
