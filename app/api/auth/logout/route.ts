import { NextRequest, NextResponse } from 'next/server';
import { revokeSessionByToken } from '@/lib/platform-store';
import { extractAuthToken, clearSessionCookie } from '@/lib/server-auth';

export async function POST(req: NextRequest) {
  const token = extractAuthToken(req);
  if (token) {
    revokeSessionByToken(token);
  }
  const res = NextResponse.json({ success: true });
  return clearSessionCookie(res);
}
