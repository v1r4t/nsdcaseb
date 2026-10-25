#!/usr/bin/env node
/**
 * Dev-only backfill: generate 640w / 1600w WebP poster variants for events
 * uploaded before the browser variant pipeline shipped.
 *
 * This script is NOT part of the app runtime. It uses `sharp`, which must be
 * installed ad hoc — do not add it to package.json dependencies:
 *
 *   npm install --no-save sharp
 *
 * Then, with the staging API and Supabase service credentials in the shell:
 *
 *   SUPABASE_URL="https://<project>.supabase.co" \
 *   SUPABASE_SERVICE_ROLE_KEY="<service-role-key>" \
 *   node scripts/backfill-image-variants.mjs --site https://preview.nsdcaseb.xyz
 *
 * Options:
 *   --site <url>       Site/API origin (default: SITE_URL or http://localhost:8788)
 *   --event <id>       Only backfill one event
 *   --dry-run          Decode + resize, report sizes, upload nothing
 *   --force            Re-upload variants that already exist
 *
 * Exit codes: 0 success, 1 one or more events failed, 2 bad invocation.
 */

import { argv, env, exit, stdout } from 'node:process';

const BUCKET = 'event-posters';
const THUMB_WIDTH = 640;
const FULL_WIDTH = 1600;
const QUALITY = 0.82;

function parseArgs(args) {
  const options = {
    site: env.SITE_URL || 'http://localhost:8788',
    event: null,
    dryRun: false,
    force: false,
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--site') options.site = args[++i] ?? options.site;
    else if (arg === '--event') options.event = args[++i] ?? null;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--force') options.force = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else {
      console.error(`Unknown option: ${arg}`);
      options.invalid = true;
    }
  }
  return options;
}

const options = parseArgs(argv.slice(2));
if (options.help) {
  stdout.write(
    'Usage: node scripts/backfill-image-variants.mjs [--site <url>] [--event <id>] [--dry-run] [--force]\n',
  );
  exit(0);
}
if (options.invalid) exit(2);
options.site = options.site.replace(/\/+$/, '');

const supabaseUrl = (env.SUPABASE_URL || '').replace(/\/+$/, '');
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!options.dryRun && (!supabaseUrl || !serviceKey)) {
  console.error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n' +
      'Use --dry-run to resize without uploading, or export both variables first.',
  );
  exit(2);
}

let sharp;
try {
  sharp = (await import('sharp')).default;
} catch {
  console.error(
    'sharp is not installed. This backfill is dev-only; install it without touching package.json:\n' +
      '  npm install --no-save sharp\n' +
      'Then re-run this script.',
  );
  exit(2);
}

function variantKeys(eventId) {
  return {
    thumb: `events/${eventId}/poster-thumb.webp`,
    full: `events/${eventId}/poster-full.webp`,
  };
}

function publicUrl(key) {
  return `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${key}`;
}

async function exists(key) {
  if (!supabaseUrl) return false;
  try {
    const res = await fetch(publicUrl(key), { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

async function upload(key, buffer) {
  const url = `${supabaseUrl}/storage/v1/object/${BUCKET}/${key}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'Content-Type': 'image/webp',
      'x-upsert': 'true',
    },
    body: buffer,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`upload ${key} failed (${res.status}): ${body.slice(0, 200)}`);
  }
}

/** One resize per breakpoint, capped at both the target and the source width. */
function resize(original, width) {
  return sharp(original)
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: QUALITY })
    .toBuffer();
}

async function backfillEvent(event) {
  const keys = variantKeys(event.id);
  if (!options.force && !options.dryRun && (await exists(keys.full))) {
    stdout.write(`= ${event.id}: variants already present, skipped\n`);
    return;
  }

  const res = await fetch(event.poster_url);
  if (!res.ok) throw new Error(`original fetch failed (${res.status})`);
  const original = Buffer.from(await res.arrayBuffer());
  const meta = await sharp(original).metadata();
  const thumb = await resize(original, THUMB_WIDTH);
  const full = await resize(original, FULL_WIDTH);

  const detail = `${meta.width ?? '?'}x${meta.height ?? '?'} -> thumb ${thumb.length}B, full ${full.length}B`;
  if (options.dryRun) {
    stdout.write(`~ ${event.id}: ${detail} (dry run, not uploaded)\n`);
    return;
  }

  await upload(keys.thumb, thumb);
  await upload(keys.full, full);
  stdout.write(`+ ${event.id}: ${detail}\n`);
}

async function main() {
  const listRes = await fetch(`${options.site}/api/events?include_archived=1`);
  if (!listRes.ok) {
    throw new Error(`event list failed (${listRes.status}) at ${options.site}`);
  }
  const payload = await listRes.json();
  const all = Array.isArray(payload?.events) ? payload.events : [];
  const targets = all.filter(
    (event) =>
      event &&
      typeof event.id === 'string' &&
      typeof event.poster_url === 'string' &&
      event.poster_url.length > 0 &&
      (!options.event || event.id === options.event),
  );

  stdout.write(
    `Backfilling poster variants for ${targets.length} event(s) from ${options.site}${options.dryRun ? ' [dry run]' : ''}\n`,
  );

  let failed = 0;
  for (const event of targets) {
    try {
      await backfillEvent(event);
    } catch (err) {
      failed += 1;
      console.error(`! ${event.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  stdout.write(`Done: ${targets.length - failed} ok, ${failed} failed\n`);
  exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  exit(1);
});
