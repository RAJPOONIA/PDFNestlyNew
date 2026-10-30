import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface SharedFormRecord {
  id: string;
  title: string;
  fileName: string;
  pdfBase64: string;
  annotationsJson: string;
  requirePin: boolean;
  pinHash?: string;
  expiresAt: string;
  createdAt: string;
  submissionCount: number;
}

const DATA_DIR = path.join(process.cwd(), '.data', 'shared-forms');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function hashPin(pin: string): string {
  return crypto.createHash('sha256').update(pin.trim()).digest('hex');
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      title,
      fileName,
      pdfBase64,
      annotationsJson,
      accessPin,
      expiresInDays = 14,
    } = body as {
      title?: string;
      fileName?: string;
      pdfBase64?: string;
      annotationsJson?: string;
      accessPin?: string;
      expiresInDays?: number;
    };

    if (!pdfBase64 || typeof pdfBase64 !== 'string' || pdfBase64.length < 20) {
      return NextResponse.json({ error: 'Valid PDF data is required to share a form.' }, { status: 400 });
    }

    // Enforce sensible size limit (~18MB base64)
    if (pdfBase64.length > 25 * 1024 * 1024) {
      return NextResponse.json({ error: 'PDF exceeds maximum shareable form size (18MB).' }, { status: 413 });
    }

    ensureDir();
    const id = `form_${crypto.randomBytes(6).toString('hex')}`;
    const days = Math.max(1, Math.min(90, Number(expiresInDays) || 14));
    const now = new Date();
    const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

    const cleanPin = typeof accessPin === 'string' ? accessPin.trim() : '';
    const record: SharedFormRecord = {
      id,
      title: (title || fileName || 'Fillable PDF Form').slice(0, 140),
      fileName: (fileName || 'form.pdf').slice(0, 120),
      pdfBase64,
      annotationsJson: typeof annotationsJson === 'string' ? annotationsJson : '[]',
      requirePin: cleanPin.length > 0,
      pinHash: cleanPin.length > 0 ? hashPin(cleanPin) : undefined,
      expiresAt,
      createdAt: now.toISOString(),
      submissionCount: 0,
    };

    const filePath = path.join(DATA_DIR, `${id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(record), { mode: 0o600 });

    return NextResponse.json({
      id: record.id,
      title: record.title,
      sharePath: `/fill-form/${record.id}`,
      requirePin: record.requirePin,
      expiresAt: record.expiresAt,
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to create shared form: ' + (err as Error).message },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = (searchParams.get('id') || '').replace(/[^a-zA-Z0-9_-]/g, '');
    const pin = searchParams.get('pin') || '';

    if (!id) {
      return NextResponse.json({ error: 'Missing form ID.' }, { status: 400 });
    }

    const filePath = path.join(DATA_DIR, `${id}.json`);
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'Shared form not found or has expired.' }, { status: 404 });
    }

    const raw = fs.readFileSync(filePath, 'utf8');
    const record = JSON.parse(raw) as SharedFormRecord;

    if (new Date(record.expiresAt).getTime() < Date.now()) {
      try {
        fs.unlinkSync(filePath);
      } catch {
        // Ignore unlink error
      }
      return NextResponse.json({ error: 'This shared form link has expired.' }, { status: 410 });
    }

    if (record.requirePin && record.pinHash) {
      if (!pin || hashPin(pin) !== record.pinHash) {
        return NextResponse.json(
          {
            error: pin ? 'Invalid access PIN.' : 'PIN required to access this form.',
            requirePin: true,
            title: record.title,
          },
          { status: 401 }
        );
      }
    }

    return NextResponse.json({
      id: record.id,
      title: record.title,
      fileName: record.fileName,
      pdfBase64: record.pdfBase64,
      annotationsJson: record.annotationsJson,
      expiresAt: record.expiresAt,
      createdAt: record.createdAt,
      submissionCount: record.submissionCount,
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to load shared form: ' + (err as Error).message },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const id = String(body.id || '').replace(/[^a-zA-Z0-9_-]/g, '');
    if (!id) {
      return NextResponse.json({ error: 'Missing form ID.' }, { status: 400 });
    }
    const filePath = path.join(DATA_DIR, `${id}.json`);
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'Shared form not found.' }, { status: 404 });
    }
    const record = JSON.parse(fs.readFileSync(filePath, 'utf8')) as SharedFormRecord;
    record.submissionCount = (record.submissionCount || 0) + 1;
    fs.writeFileSync(filePath, JSON.stringify(record), { mode: 0o600 });
    return NextResponse.json({ ok: true, submissionCount: record.submissionCount });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to update submission count: ' + (err as Error).message },
      { status: 500 }
    );
  }
}
