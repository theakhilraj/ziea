import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { randomBytes } from 'crypto';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

export const runtime = 'nodejs';

// PUBLIC consultation reference-image upload. Unlike app/api/upload/route.ts
// (admin-only, arbitrary folder), this endpoint is callable by unauthenticated
// customers, so it is deliberately hardened: a tight image allow-list, a small
// size cap, a per-IP rate limit, and a HARD-CODED destination folder (callers
// can never choose where their bytes land).

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB per image

// Only these image types are accepted; the value is the extension we save with.
// GIF and AVIF are intentionally excluded, and image/svg+xml is BANNED outright
// (SVG is XML and can carry <script> → stored-XSS when served from our origin).
const ALLOWED_TYPES = new Map<string, string>([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

// Public bytes only ever land here — never a caller-supplied path.
const CONSULTATION_FOLDER = 'consultations';

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

// ── In-memory per-IP rate limit ──────────────────────────────────────────────
// Allow RATE_LIMIT_MAX uploads per RATE_LIMIT_WINDOW_MS per IP. State lives in a
// module-level Map, so it is PER PROCESS: it resets on redeploy and is not
// shared across instances. That is fine for the single Hostinger node this runs
// on; a horizontally-scaled deploy would need a shared store (e.g. Redis).
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const uploadHits = new Map<string, number[]>();

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

/** Sanitize a folder segment into a safe single segment (no traversal). */
function safeFolder(input: string): string {
  return (
    input
      .split('/')
      .map((seg) => seg.replace(/[^a-zA-Z0-9._-]/g, '_'))
      .filter((seg) => seg && seg !== '.' && seg !== '..')
      .join('/') || 'uploads'
  );
}

/**
 * Sniff the real image type from magic bytes, returning the canonical extension
 * ('jpg' | 'png' | 'webp') or null. The declared multipart Content-Type is
 * caller-controlled and trivially spoofable, so we verify the ACTUAL bytes before
 * trusting/storing the upload — this is what makes the "image-only" guarantee
 * real and rejects SVG/HTML/JS/polyglot payloads that merely claim to be image/png.
 */
function sniffImageExt(buf: Buffer): string | null {
  // JPEG: FF D8 FF
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'jpg';
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) {
    return 'png';
  }
  // WebP: "RIFF" .... "WEBP"
  if (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

/** Best-effort client IP from proxy headers (Hostinger sits behind a proxy). */
function clientIp(h: Headers): string {
  const forwarded = h.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return h.get('x-real-ip')?.trim() || 'unknown';
}

/**
 * Records a hit for `ip` and returns whether it is now over the limit.
 * Prunes timestamps outside the sliding window on every call.
 */
function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  // Opportunistic eviction: once the map is large, drop fully-stale IP buckets so
  // a stream of distinct IPs can't grow it without bound (single-node limiter).
  if (uploadHits.size > 5000) {
    for (const [key, times] of uploadHits) {
      if (times.every((t) => t <= cutoff)) uploadHits.delete(key);
    }
  }
  const recent = (uploadHits.get(ip) ?? []).filter((t) => t > cutoff);
  recent.push(now);
  uploadHits.set(ip, recent);
  return recent.length > RATE_LIMIT_MAX;
}

export async function POST(request: Request) {
  try {
    const h = await headers();
    const ip = clientIp(h);

    if (isRateLimited(ip)) {
      return NextResponse.json(
        { error: 'Too many uploads. Please try again later.' },
        { status: 429 },
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const ext = ALLOWED_TYPES.get(file.type);
    if (!ext) {
      return NextResponse.json(
        {
          error: `Unsupported file type: ${file.type || 'unknown'}. Allowed: JPEG, PNG, WebP.`,
        },
        { status: 415 },
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File too large (max 5MB)' }, { status: 413 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Verify the REAL bytes are the image type they claim to be (the declared
    // Content-Type above is caller-controlled). Rejects spoofed SVG/HTML/polyglot
    // payloads sent as image/png before anything is written to disk.
    const sniffed = sniffImageExt(buffer);
    if (!sniffed || sniffed !== ext) {
      return NextResponse.json(
        { error: 'File is not a valid JPEG, PNG or WebP image.' },
        { status: 415 },
      );
    }

    // Collision-proof unique name: <timestamp>-<random>-<slug>.<ext>
    const unique = `${Date.now()}-${randomBytes(4).toString('hex')}`;
    const finalName = `${unique}-${slugify(file.name)}.${ext}`;

    // Folder is hard-coded (not caller-supplied); safeFolder is a belt-and-braces
    // guard so the public can never traverse out of the consultations folder.
    const folder = safeFolder(CONSULTATION_FOLDER);
    const destDir = path.join(UPLOAD_DIR, folder);

    await mkdir(destDir, { recursive: true });
    await writeFile(path.join(destDir, finalName), buffer);

    // Public URL served either statically by Hostinger (public_html/cdn) or by
    // the app's own /cdn/[...path] route (dev, next start, or fallback).
    return NextResponse.json({ url: `${BASE_URL}/${folder}/${finalName}` });
  } catch (error: unknown) {
    // Log the detail server-side only; never leak fs error text (which embeds the
    // absolute Hostinger path / username) to unauthenticated callers.
    console.error('Consultation upload error:', error);
    return NextResponse.json(
      { error: 'Upload failed. Please try again.' },
      { status: 500 },
    );
  }
}
