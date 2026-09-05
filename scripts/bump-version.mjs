#!/usr/bin/env node
/**
 * Bump the LodgeIT STO portal version — the same contract as Lodge Ops'
 * scripts/bump-version.mjs, trimmed to this repo's shape (no database).
 *
 *   node scripts/bump-version.mjs [patch|minor|major]   (default: patch)
 *
 * Single source of truth is the root VERSION file. This script increments it
 * and syncs the number into package.json, app/package.json and
 * server/package.json. The server reports VERSION on /health.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const kind = (process.argv[2] ?? 'patch').toLowerCase();
if (!['patch', 'minor', 'major'].includes(kind)) {
  console.error(`Unknown bump type "${kind}". Use patch, minor, or major.`);
  process.exit(1);
}
const versionFile = join(root, 'VERSION');
const current = readFileSync(versionFile, 'utf8').trim();
const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(current);
if (!match) {
  console.error(`VERSION file does not contain a valid x.y.z version: "${current}"`);
  process.exit(1);
}
let [major, minor, patch] = match.slice(1).map(Number);
if (kind === 'major') { major += 1; minor = 0; patch = 0; }
else if (kind === 'minor') { minor += 1; patch = 0; }
else patch += 1;
const next = `${major}.${minor}.${patch}`;
writeFileSync(versionFile, `${next}\n`);
for (const rel of ['package.json', 'app/package.json', 'server/package.json']) {
  const path = join(root, rel);
  try {
    const pkg = JSON.parse(readFileSync(path, 'utf8'));
    pkg.version = next;
    writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`);
  } catch (err) {
    console.warn(`Skipped ${rel}: ${err.message}`);
  }
}
console.log(`Version bumped: ${current} -> ${next} (${kind})`);
