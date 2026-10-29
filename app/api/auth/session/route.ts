import { NextRequest, NextResponse } from 'next/server';
import { getSystemSettings } from '@/lib/platform-store';
import {
  resolveAuthenticatedUser,
  attachSessionCookie,
} from '@/lib/server-auth';

export async function GET(req: NextRequest) {
  try {
    const resolved = await resolveAuthenticatedUser(req);
    const settings = getSystemSettings();

    const res = NextResponse.json({
      authenticated: Boolean(resolved?.user),
      user: resolved?.user || null,
      settings: {
        registrationEnabled: settings.registrationEnabled,
        googleAuthEnabled: settings.googleAuthEnabled,
        emailAuthEnabled: settings.emailAuthEnabled,
        maintenanceMode: settings.maintenanceMode,
        maintenanceMessage: settings.maintenanceMessage,
        maxUploadSizeMb: settings.maxUploadSizeMb,
      },
    });

    if (resolved?.sessionToken) {
      attachSessionCookie(res, resolved.sessionToken);
    }

    return res;
  } catch (err) {
    return NextResponse.json(
      {
        authenticated: false,
        user: null,
        error: err instanceof Error ? err.message : 'Session check failed.',
      },
      { status: 500 }
    );
  }
}
