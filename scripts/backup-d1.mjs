#!/usr/bin/env node
/**
 * D1 backup + Supabase Storage inventory for the NSDC site.
 *
 * D1 is the system of record (users, events, registrations, applications,
 * audit log). Supabase Storage holds event posters, gallery photos and
 * broadcast images; those objects are referenced by D1 rows, so a D1 dump alone
 * is not a complete restore. This script:
 *
 *   1. exports the selected D1 database to a timestamped `.sql` file,
 *   2. verifies the dump is non-empty and not an error page,
 *   3. writes a SHA-256 checksum and prints it for the deploy notes,
 *   4. optionally writes a Supabase Storage manifest (bucket + object keys +
 *      sizes) so a restore can prove which objects are missing. It does not
 *      download the bytes — use `rclone` for that (see docs/runbook.md).
 *
 * Nothing here is part of the app runtime and nothing is committed: the default
 * output directory `tmp-d1-backups/` matches the `tmp-*` rule in `.gitignore`.
 *
 * Usage:
 *   node scripts/backup-d1.mjs                       # staging, remote
 *   node scripts/backup-d1.mjs --env production      # nsdc-auth-prod, remote
 *   node scripts/backup-d1.mjs --label pre-cutover
 *   node scripts/backup-d1.mjs --local               # local wrangler dev DB
 *   node scripts/backup-d1.mjs --dry-run             # print commands only
 *   node scripts/backup-d1.mjs --no-supabase         # skip the storage manifest
 *   node scripts/backup-d1.mjs --supabase            # require the manifest
 *
 * Remote runs need Cloudflare credentials (`wrangler login`, or
 * CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID in CI). The Supabase manifest is
 * opt-in automatically when both SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are
 * set; `--supabase` makes a missing pair a hard error instead.
 *
 * Exit codes: 0 success, 1 export/verification failure, 2 bad invocation.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { argv, env, exit, platform, stderr, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUT_DIR = 'tmp-d1-backups';

/** Environment -> committed Wrangler config + D1 database name. */
const TARGETS = {
  staging: { config: 'wrangler.staging.jsonc', database: 'nsdc-auth' },
  production: { config: 'wrangler.production.jsonc', database: 'nsdc-auth-prod' },
};

/** Buckets written by worker/supabase-storage.ts. */
const STORAGE_BUCKETS = ['event-posters', 'email-assets'];

/** Supabase Storage list endpoint page size (the API caps this at 1000). */
const LIST_PAGE_SIZE = 1000;

function printUsage(stream = stdout) {
  stream.write(
    [
      'Usage: node scripts/backup-d1.mjs [options]',
      '',
      '  --env <staging|production>  Target environment (default: staging)',
      '  --config <path>             Wrangler config override',
      '  --database <name>           D1 database name override',
      '  --out-dir <dir>             Output directory (default: tmp-d1-backups/)',
      '  --label <text>              Suffix for the file name (e.g. pre-deploy)',
      '  --keep <n>                  Keep the newest n dumps (default: 10; 0 = all)',
      '  --local                     Export the local wrangler dev database',
      '  --dry-run                   Print the commands without running them',
      '  --supabase                  Require the manifest (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)',
      '  --no-supabase               Skip the Supabase Storage manifest',
      '  -h, --help                  Show this help',
      '',
      'Examples:',
      '  node scripts/backup-d1.mjs --label pre-deploy',
      '  node scripts/backup-d1.mjs --env production --label pre-cutover',
      '',
      'Restores are never in-place: import a dump into a NEW D1 database and',
      'verify it before repointing any config. See docs/runbook.md.',
      '',
    ].join('\n'),
  );
}

function parseArgs(args) {
  const options = {
    environment: 'staging',
    config: null,
    database: null,
    outDir: DEFAULT_OUT_DIR,
    label: '',
    keep: 10,
    local: false,
    dryRun: false,
    supabase: 'auto', // 'auto' | 'require' | 'skip'
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--env') options.environment = args[++i] ?? '';
    else if (arg === '--config') options.config = args[++i] ?? '';
    else if (arg === '--database') options.database = args[++i] ?? '';
    else if (arg === '--out-dir') options.outDir = args[++i] ?? '';
    else if (arg === '--label') options.label = args[++i] ?? '';
    else if (arg === '--keep') options.keep = Number(args[++i]);
    else if (arg === '--local') options.local = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--supabase') options.supabase = 'require';
    else if (arg === '--no-supabase') options.supabase = 'skip';
    else if (arg === '--help' || arg === '-h') options.help = true;
    else {
      stderr.write(`Unknown option: ${arg}\n`);
      options.invalid = true;
    }
  }

  if (!Object.hasOwn(TARGETS, options.environment)) {
    stderr.write(`Unknown --env: ${options.environment} (expected staging or production)\n`);
    options.invalid = true;
  }
  if (!Number.isInteger(options.keep) || options.keep < 0) {
    stderr.write('--keep must be a non-negative integer\n');
    options.invalid = true;
  }
  if (options.label && !/^[A-Za-z0-9._-]+$/.test(options.label)) {
    stderr.write('--label may only contain letters, digits, dot, underscore and dash\n');
    options.invalid = true;
  }
  return options;
}

const options = parseArgs(argv.slice(2));
if (options.help) {
  printUsage();
  exit(0);
}
if (options.invalid) {
  printUsage(stderr);
  exit(2);
}

const target = TARGETS[options.environment];
const configPath = options.config || target.config;
const database = options.database || target.database;
const outDir = resolve(process.cwd(), options.outDir);
const scope = options.local ? 'local' : 'remote';

function timestamp() {
  // 20261031T142530Z — filesystem-safe, sorts lexicographically.
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

const label = options.label ? `-${options.label}` : '';
const baseName = `${database}-${options.environment}-${timestamp()}${label}`;
const dumpPath = join(outDir, `${baseName}.sql`);
const manifestPath = join(outDir, `${baseName}.storage-manifest.json`);

function wranglerBin() {
  const bin = join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  if (!existsSync(bin)) {
    stderr.write('wrangler is not installed. Run `npm ci` first.\n');
    process.exit(1);
  }
  return bin;
}

function exportArgs() {
  return [
    wranglerBin(),
    'd1',
    'export',
    database,
    options.local ? '--local' : '--remote',
    '-c',
    configPath,
    '--output',
    dumpPath,
    '--skip-confirmation',
  ];
}

function relativeToRoot(file) {
  return resolve(file).startsWith(ROOT) ? resolve(file).slice(ROOT.length + 1) : resolve(file);
}

async function exportD1() {
  if (!existsSync(resolve(ROOT, configPath))) {
    throw new Error(`Wrangler config not found: ${configPath}`);
  }

  const cmd = [process.execPath, ...exportArgs()];
  stdout.write(`\n[d1] exporting ${database} (${scope}) via ${configPath}\n`);
  stdout.write(`     ${cmd.join(' ')}\n`);

  if (options.dryRun) return { dryRun: true };

  await mkdir(outDir, { recursive: true });
  const result = spawnSync(cmd[0], cmd.slice(1), {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`wrangler d1 export exited with code ${result.status}`);
  }

  const info = await stat(dumpPath).catch(() => null);
  if (!info || info.size === 0) {
    throw new Error(`export produced no data at ${relativeToRoot(dumpPath)}`);
  }

  // A failed export can still write an HTML/JSON error body to the file.
  const head = (await readFile(dumpPath, 'utf8')).slice(0, 4096).trimStart();
  if (head.startsWith('<') || head.startsWith('{')) {
    throw new Error(`export output does not look like SQL (starts with "${head.slice(0, 20)}")`);
  }
  if (!/CREATE TABLE|PRAGMA|INSERT INTO/i.test(head)) {
    throw new Error('export output has no SQL statements; refusing to trust it');
  }

  const digest = createHash('sha256').update(await readFile(dumpPath)).digest('hex');
  return { size: info.size, sha256: digest };
}

function supabaseCredentials() {
  const base = (env.SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
  const key = (env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  return base && key ? { base, key } : null;
}

function shouldWriteManifest() {
  if (options.supabase === 'skip') return false;
  const creds = supabaseCredentials();
  if (options.supabase === 'require' && !creds) {
    throw new Error('--supabase needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  }
  return Boolean(creds);
}

async function supabaseFetch(creds, path, body) {
  const res = await fetch(`${creds.base}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: `Bearer ${creds.key}`,
      apikey: creds.key,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Supabase ${path} -> ${res.status} ${text.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * Recursively list one bucket prefix. Folder entries come back with `id: null`
 * and are walked by prefix; object entries carry a size in `metadata.size`.
 */
async function listPrefix(creds, bucket, prefix, depth = 0) {
  const objects = [];
  let offset = 0;
  for (let page = 0; page < 100; page += 1) {
    const entries = await supabaseFetch(
      creds,
      `/storage/v1/object/list/${encodeURIComponent(bucket)}`,
      { prefix, limit: LIST_PAGE_SIZE, offset, sortBy: { column: 'name', order: 'asc' } },
    );
    if (!Array.isArray(entries)) {
      throw new Error(`unexpected list response for ${bucket}/${prefix}`);
    }

    for (const entry of entries) {
      if (!entry || typeof entry.name !== 'string') continue;
      const key = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) {
        if (depth < 8) objects.push(...(await listPrefix(creds, bucket, key, depth + 1)));
      } else {
        objects.push({
          key,
          size: Number(entry.metadata?.size ?? 0),
          updated_at: entry.updated_at ?? null,
        });
      }
    }

    if (entries.length < LIST_PAGE_SIZE) return objects;
    offset += entries.length;
  }
  throw new Error(`pagination guard hit for ${bucket}/${prefix}; manifest would be incomplete`);
}

async function writeStorageManifest() {
  const creds = supabaseCredentials();
  if (!creds) return null;

  const manifest = {
    generated_at: new Date().toISOString(),
    supabase_origin: creds.base,
    note: 'Object inventory only. Bytes are not included; restore with rclone (docs/runbook.md).',
    buckets: {},
  };

  stdout.write('\n[supabase] listing storage objects\n');
  let failures = 0;
  for (const bucket of STORAGE_BUCKETS) {
    try {
      const objects = await listPrefix(creds, bucket, '');
      const bytes = objects.reduce((sum, item) => sum + item.size, 0);
      manifest.buckets[bucket] = { object_count: objects.length, total_bytes: bytes, objects };
      stdout.write(`           ${bucket}: ${objects.length} objects, ${bytes} bytes\n`);
    } catch (error) {
      // A missing bucket is legitimate on a fresh project; auth/network errors
      // surface as the same message, so record it and keep the D1 dump usable.
      failures += 1;
      manifest.buckets[bucket] = { error: String(error.message ?? error) };
      stderr.write(`[supabase] ${bucket} could not be listed: ${error.message ?? error}\n`);
    }
  }

  await mkdir(outDir, { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  if (failures > 0 && options.supabase === 'require') {
    throw new Error(`Storage manifest incomplete (${failures} bucket(s) failed); D1 dump is valid`);
  }
  return manifestPath;
}

async function pruneOldDumps() {
  if (options.keep === 0 || options.dryRun) return [];
  const prefix = `${database}-${options.environment}-`;
  const entries = await readdir(outDir, { withFileTypes: true }).catch(() => []);
  const dumps = entries
    .filter((entry) => entry.isFile() && entry.name.startsWith(prefix) && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort();

  const stale = dumps.slice(0, Math.max(0, dumps.length - options.keep));
  const removed = [];
  for (const name of stale) {
    await unlink(join(outDir, name));
    const manifestName = `${name.slice(0, -4)}.storage-manifest.json`;
    await unlink(join(outDir, manifestName)).catch(() => {});
    removed.push(name);
  }
  return removed;
}

function humanBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function main() {
  stdout.write(`NSDC backup — ${database} (${options.environment}, ${scope})\n`);
  stdout.write(`output: ${relativeToRoot(outDir)}/\n`);

  const dump = await exportD1();

  if (options.dryRun) {
    if (options.supabase === 'skip') {
      stdout.write('\n[supabase] skipped (--no-supabase)\n');
    } else {
      stdout.write('\n[supabase] would write a storage manifest when credentials are set\n');
    }
    stdout.write('\n[done] dry run: nothing written\n');
    return;
  }

  const removed = await pruneOldDumps();
  if (removed.length > 0) {
    stdout.write(`\n[prune] removed ${removed.length} old dump(s), keeping ${options.keep}\n`);
  }

  let manifest = null;
  if (shouldWriteManifest()) {
    manifest = await writeStorageManifest();
  } else {
    stdout.write('\n[supabase] skipped: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set\n');
  }

  stdout.write('\n[done] D1 dump\n');
  stdout.write(`  file    ${relativeToRoot(dumpPath)}\n`);
  stdout.write(`  size    ${humanBytes(dump.size)}\n`);
  stdout.write(`  sha256  ${dump.sha256}\n`);
  if (manifest) stdout.write(`  storage ${relativeToRoot(manifest)}\n`);
  stdout.write(
    [
      '',
      'Keep this dump out of git (tmp-* is ignored). To verify it, import into a',
      'throwaway D1 database, never over staging/production:',
      '',
      `  npx wrangler d1 create nsdc-restore-check`,
      `  npx wrangler d1 execute nsdc-restore-check --remote -c ${configPath} --file=${relativeToRoot(dumpPath)}`,
      '',
    ].join('\n'),
  );
}

main().catch((error) => {
  stderr.write(`\n[error] ${error.message ?? error}\n`);
  if (platform === 'win32' && /EPERM|EINVAL/.test(String(error.message))) {
    stderr.write('Hint: run the command from a normal shell; the script calls Node directly.\n');
  }
  exit(1);
});
