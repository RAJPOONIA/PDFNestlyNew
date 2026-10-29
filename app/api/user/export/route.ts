import { NextRequest, NextResponse } from 'next/server';
import { exportUserAccountData } from '@/lib/platform-store';
import { requireAuthenticatedUser } from '@/lib/server-auth';

export async function GET(req: NextRequest) {
  const authCheck = await requireAuthenticatedUser(req);
  if (!authCheck.ok) return authCheck.response;

  try {
    const payload = exportUserAccountData(authCheck.user.uid);
    const jsonString = JSON.stringify(payload, null, 2);
    const dateStamp = new Date().toISOString().slice(0, 10);

    return new NextResponse(jsonString, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="pdfnestly-account-export-${dateStamp}.json"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Unable to export account data.',
      },
      { status: 400 }
    );
  }
}
