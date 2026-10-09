#!/usr/bin/env node
/**
 * scripts/snapshot-content.mjs
 *
 * Pulls the public website content out of the Firebase Realtime Database and
 * writes it into the codebase as a hardcoded fallback snapshot. If Firebase is
 * ever unreachable (outage, billing lapse, revoked credentials, deleted
 * project, wiped data) the client and API serve this snapshot instead of an
 * empty page.
 *
 * Nodes copied (everything under /public that the public site renders):
 *   siteContent, blog, profiles, nav, calcConfig
 *
 * Nodes deliberately NOT copied (private / operational):
 *   audit, logs, calendar, notifications, inquiries, …
 *
 * Output (both generated — never edit by hand):
 *   client/src/app/schema/snapshot/data.ts
 *   server/src/data/site-snapshot.ts
 *
 * Usage:
 *   node scripts/snapshot-content.mjs           refresh; exit 1 on any failure
 *   node scripts/snapshot-content.mjs --soft    refresh; NEVER fail (for builds) —
 *                                               keeps the existing snapshot on error
 *   node scripts/snapshot-content.mjs --dry     fetch + validate, write nothing
 *   node scripts/snapshot-content.mjs --force   skip the "suspicious shrink" guard
 *   node scripts/snapshot-content.mjs --from-file=export.json
 *                                               build the snapshot from a JSON file instead
 *                                               of the network — e.g. a Firebase console
 *                                               "Export JSON" of the whole DB or of /public
 *
 * Environment:
 *   FIREBASE_DATABASE_URL    defaults to the production RTDB URL below
 *   FIREBASE_SNAPSHOT_AUTH   optional ?auth= token, only needed if the /public
 *                            rules ever stop allowing unauthenticated reads
 *
 * Safety rules — a bad fetch must never destroy a good backup:
 *   • Every required node must come back and pass validation.
 *   • If blog posts or profiles shrink by more than half compared to the
 *     existing snapshot, the write is refused (use --force if intentional).
 *   • If nothing changed, the files are left untouched (no diff noise).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const args  = new Set(process.argv.slice(2));
const SOFT  = args.has('--soft');
const DRY   = args.has('--dry');
const FORCE = args.has('--force');
const FROM_FILE = process.argv.slice(2).find((a) => a.startsWith('--from-file='))?.slice('--from-file='.length);

const DB_URL = (process.env.FIREBASE_DATABASE_URL || 'https://friclowenstein-default-rtdb.firebaseio.com')
  .replace(/\/+$/, '');
const AUTH       = process.env.FIREBASE_SNAPSHOT_AUTH || '';
const DB_ROOT    = 'public';
const TIMEOUT_MS = 15_000;

const NODES             = ['siteContent', 'blog', 'profiles', 'nav', 'calcConfig'];
const REQUIRED_SECTIONS = ['home', 'aboutUs', 'areasOfLaw', 'faq', 'pricing'];

const OUT = {
  client: path.join(ROOT, 'client/src/app/schema/snapshot/data.ts'),
  server: path.join(ROOT, 'server/src/data/site-snapshot.ts'),
};

const BEGIN = '// @snapshot-begin';
const END   = '// @snapshot-end';

// ── Logging ───────────────────────────────────────────────────────────────────

const log  = (s) => console.log(`[snapshot] ${s}`);
const warn = (s) => console.warn(`[snapshot] ⚠ ${s}`);

function bail(message) {
  if (SOFT) {
    warn(`${message}`);
    warn('Keeping the existing snapshot (--soft: build continues).');
    process.exit(0);
  }
  console.error(`[snapshot] ✗ ${message}`);
  process.exit(1);
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

async function fetchNode(node) {
  const qs  = AUTH ? `?auth=${encodeURIComponent(AUTH)}` : '';
  const url = `${DB_URL}/${DB_ROOT}/${node}.json${qs}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GET /${DB_ROOT}/${node} → HTTP ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json();
}

// ── Validation ────────────────────────────────────────────────────────────────

const isObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

function countBlog(blog) {
  return isObj(blog) ? Object.values(blog).filter((p) => isObj(p) && p.title).length : 0;
}

function countProfiles(profiles) {
  if (Array.isArray(profiles)) return profiles.filter((p) => isObj(p) && p.id).length;
  return isObj(profiles) ? Object.values(profiles).filter((p) => isObj(p) && p.id).length : 0;
}

function validate(snap) {
  const problems = [];
  if (!isObj(snap.siteContent)) {
    problems.push('siteContent is missing');
  } else {
    for (const s of REQUIRED_SECTIONS) {
      if (!isObj(snap.siteContent[s])) problems.push(`siteContent/${s} is missing`);
    }
  }
  if (countBlog(snap.blog) === 0)         problems.push('blog has no posts');
  if (countProfiles(snap.profiles) === 0) problems.push('profiles is empty');
  return problems;
}

// ── Existing snapshot ─────────────────────────────────────────────────────────

function readExisting(file) {
  try {
    const src = fs.readFileSync(file, 'utf8');
    const a = src.indexOf(BEGIN);
    const b = src.indexOf(END);
    if (a < 0 || b < 0) return null;
    const block = src.slice(a + BEGIN.length, b);
    const json  = block.slice(block.indexOf('=') + 1).trim().replace(/;$/, '');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function withoutTimestamp(snap) {
  if (!snap) return null;
  const { meta, ...data } = snap;
  return JSON.stringify(data);
}

// ── Render ────────────────────────────────────────────────────────────────────

const HEADER = (extra) => `/* eslint-disable */
/**
 * AUTO-GENERATED by scripts/snapshot-content.mjs — DO NOT EDIT BY HAND.
 *
 * Hardcoded copy of the Firebase /public content, used only when the live
 * database cannot be reached. Refresh with:  npm run snapshot
 */
${extra}`;

function renderClient(snap) {
  return HEADER(`import type { RawSiteSnapshot } from './types';\n\n`) +
    `${BEGIN}\nexport const SITE_SNAPSHOT: RawSiteSnapshot = ${JSON.stringify(snap, null, 2)};\n${END}\n`;
}

function renderServer(snap) {
  return HEADER(`
export interface ServerSiteSnapshot {
  meta: { generatedAt: string; source: string; databaseURL: string; root: string };
  [node: string]: unknown;
}

`) + `${BEGIN}\nexport const SITE_SNAPSHOT: ServerSiteSnapshot = ${JSON.stringify(snap, null, 2)};\n${END}\n`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

function loadFromFile(file) {
  const json = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  // Accept a whole-DB export ({ public: {...} }), a /public export, or a prior snapshot.
  const src = isObj(json[DB_ROOT]) ? json[DB_ROOT] : json;
  return NODES.map((n) => src[n] ?? null);
}

async function main() {
  let results;
  try {
    if (FROM_FILE) {
      log(`Reading ${FROM_FILE}`);
      results = loadFromFile(FROM_FILE);
    } else {
      log(`Reading ${DB_URL}/${DB_ROOT}/{${NODES.join(',')}}`);
      results = await Promise.all(NODES.map(fetchNode));
    }
  } catch (err) {
    bail(`Snapshot source could not be read: ${err?.message ?? err}`);
  }

  const snap = {
    meta: {
      generatedAt: new Date().toISOString(),
      source:      FROM_FILE ? 'file' : 'firebase',
      databaseURL: DB_URL,
      root:        DB_ROOT,
    },
  };
  NODES.forEach((node, i) => { snap[node] = results[i] ?? null; });

  const problems = validate(snap);
  if (problems.length) bail(`Fetched data failed validation: ${problems.join('; ')}`);

  const existing = readExisting(OUT.client);

  // Shrink guard — a half-wiped database must not overwrite a good backup.
  if (existing && !FORCE) {
    const checks = [
      ['blog posts', countBlog(existing.blog),         countBlog(snap.blog)],
      ['profiles',   countProfiles(existing.profiles), countProfiles(snap.profiles)],
    ];
    for (const [label, before, after] of checks) {
      if (before > 0 && after < before / 2) {
        bail(`${label} dropped from ${before} to ${after}. Refusing to overwrite (use --force if intentional).`);
      }
    }
  }

  log(`siteContent: ${Object.keys(snap.siteContent).join(', ')}`);
  log(`blog posts: ${countBlog(snap.blog)}, profiles: ${countProfiles(snap.profiles)}, ` +
      `calcConfig: ${snap.calcConfig ? 'yes' : 'none'}`);

  if (withoutTimestamp(existing) === withoutTimestamp(snap)) {
    log('No content changes since the last snapshot — files left untouched.');
    return;
  }

  if (DRY) {
    log('--dry: content differs from the current snapshot; nothing written.');
    return;
  }

  fs.mkdirSync(path.dirname(OUT.client), { recursive: true });
  fs.mkdirSync(path.dirname(OUT.server), { recursive: true });
  fs.writeFileSync(OUT.client, renderClient(snap), 'utf8');
  fs.writeFileSync(OUT.server, renderServer(snap), 'utf8');
  log(`✓ Wrote ${path.relative(ROOT, OUT.client)}`);
  log(`✓ Wrote ${path.relative(ROOT, OUT.server)}`);
}

main().catch((err) => bail(`Unexpected error: ${err?.stack ?? err}`));
