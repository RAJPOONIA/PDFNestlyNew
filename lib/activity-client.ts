'use client';

export type ClientActivityEventType =
  | 'page_viewed'
  | 'tool_opened'
  | 'pdf_upload_started'
  | 'pdf_processing_started'
  | 'pdf_processing_completed'
  | 'pdf_processing_failed'
  | 'pdf_download_completed';

const ANON_SESSION_STORAGE_KEY = 'pdfnestly_anon_sid';

export function getOrCreateAnonymousSessionId(): string {
  if (typeof window === 'undefined') return 'server';
  try {
    let existing = window.sessionStorage.getItem(ANON_SESSION_STORAGE_KEY);
    if (!existing) {
      existing = `anon_${Date.now().toString(36)}_${Math.random()
        .toString(36)
        .slice(2, 10)}`;
      window.sessionStorage.setItem(ANON_SESSION_STORAGE_KEY, existing);
    }
    return existing;
  } catch {
    return `anon_mem_${Date.now().toString(36)}`;
  }
}

export function createClientJobId(toolSlug: string): string {
  const cleanSlug = (toolSlug || 'pdf')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 24);
  return `job_${cleanSlug}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export async function trackPdfActivity(params: {
  eventType: ClientActivityEventType;
  toolSlug?: string;
  toolName?: string;
  pagePath?: string;
  status?: 'info' | 'started' | 'succeeded' | 'failed';
  durationMs?: number;
  fileSizeBytes?: number;
  outputSizeBytes?: number;
  errorCategory?: string;
  jobId?: string;
  dedupeKey?: string;
}): Promise<{ jobId: string | null }> {
  if (typeof window === 'undefined') return { jobId: null };

  const anonymousSessionId = getOrCreateAnonymousSessionId();

  // Send strictly non-PII tool lifecycle metrics to GA4 when applicable
  try {
    if (
      typeof window.gtag === 'function' &&
      (params.eventType === 'tool_opened' ||
        params.eventType === 'pdf_processing_completed' ||
        params.eventType === 'pdf_processing_failed' ||
        params.eventType === 'pdf_download_completed')
    ) {
      window.gtag('event', params.eventType, {
        tool_slug: params.toolSlug || 'unknown',
        tool_status: params.status || 'info',
        duration_ms: params.durationMs || 0,
      });
    }
  } catch {
    // Ignore GA4 dispatch errors
  }

  try {
    const res = await fetch('/api/activity/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...params,
        anonymousSessionId,
      }),
    });
    if (!res.ok) return { jobId: params.jobId || null };
    const data = await res.json();
    return { jobId: data.jobId || params.jobId || null };
  } catch {
    return { jobId: params.jobId || null };
  }
}
