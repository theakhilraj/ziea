import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { getAdminClaims } from '@/utils/admin/session';

export const runtime = 'nodejs';

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB per image

// Only these image types are accepted; the value is the extension we save with.
const ALLOWED_TYPES = new Map<string, string>([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
  ['image/avif', 'avif'],
  ['image/svg+xml', 'svg'],
]);

// HOSTINGER FILESYSTEM STORAGE — the app runs as a persistent Node server on
// Hostinger, so uploads are written directly to the local filesystem.
// IMPORTANT: ASSET_UPLOAD_DIR must live OUTSIDE public_html. Hostinger overwrites
// public_html on every deploy, which wipes uploaded assets. Point it at a
// persistent path (sibling of public_html) and serve via the app's /cdn route so
// files survive deploys:
//   ASSET_UPLOAD_DIR            PROD: /home/<user>/ziea-assets/cdn   (NOT public_html)
//   NEXT_PUBLIC_ASSET_BASE_URL  PROD: /cdn   (relative → served by app/cdn/[...path])
// Dev defaults below write to ./storage/cdn and serve from the /cdn route.
const UPLOAD_DIR =
  process.env.ASSET_UPLOAD_DIR || path.join(process.cwd(), 'storage', 'cdn');
const BASE_URL = (process.env.NEXT_PUBLIC_ASSET_BASE_URL || '/cdn').replace(/\/+$/, '');

/** Turn an original filename into a short, url-safe slug (no extension). */
function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'file'
  );
}

/** Sanitize a caller-supplied folder into safe nested segments (no traversal). */
function safeFolder(input: string): string {
  return (
    input
      .split('/')
      .map((seg) => seg.replace(/[^a-zA-Z0-9._-]/g, '_'))
      .filter((seg) => seg && seg !== '.' && seg !== '..')
      .join('/') || 'uploads'
  );
}

export async function POST(request: Request) {
  try {
    // Admin-only: uploads must never be callable by anonymous users.
    const claims = await getAdminClaims();
    if (!claims || claims.role !== 'Admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const folder = safeFolder((formData.get('folder') as string) || 'uploads');

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const ext = ALLOWED_TYPES.get(file.type);
    if (!ext) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type || 'unknown'}` },
        { status: 415 },
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File too large (max 15MB)' }, { status: 413 });
    }

    // Collision-proof unique name: <timestamp>-<random>-<slug>.<ext>
    const unique = `${Date.now()}-${randomBytes(4).toString('hex')}`;
    const finalName = `${unique}-${slugify(file.name)}.${ext}`;
    const destDir = path.join(UPLOAD_DIR, folder);

    await mkdir(destDir, { recursive: true });
    await writeFile(path.join(destDir, finalName), Buffer.from(await file.arrayBuffer()));

    // Public URL served either statically by Hostinger (public_html/cdn) or by
    // the app's own /cdn/[...path] route (dev, next start, or fallback).
    return NextResponse.json({ url: `${BASE_URL}/${folder}/${finalName}` });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    console.error('Image upload error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/* ───────────────────────────────────────────────────────────────────────────
 * TEMP SUPABASE STORAGE fallback (works on Vercel/serverless, where the fs
 * approach fails on the read-only filesystem). Restore this block (and remove
 * the filesystem block above) if you deploy on Vercel again.
 *   Requires: import { createClient } from '@supabase/supabase-js';
 *             SUPABASE_SERVICE_ROLE_KEY set in env.
 *
 * const STORAGE_BUCKET = 'Testing';
 * const supabase = createClient(
 *   process.env.NEXT_PUBLIC_SUPABASE_URL!,
 *   process.env.SUPABASE_SERVICE_ROLE_KEY!,
 *   { auth: { persistSession: false } },
 * );
 * const objectPath = `${folder}/${unique}-${slugify(file.name)}.${ext}`;
 * const { error: uploadError } = await supabase.storage
 *   .from(STORAGE_BUCKET)
 *   .upload(objectPath, Buffer.from(await file.arrayBuffer()), {
 *     contentType: file.type, upsert: false,
 *   });
 * if (uploadError) throw uploadError;
 * const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(objectPath);
 * return NextResponse.json({ url: data.publicUrl });
 * ─────────────────────────────────────────────────────────────────────────── */
