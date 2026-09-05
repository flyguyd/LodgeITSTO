// The STO PORTAL server (Dave, 2026-09-05): "STO's will have a separate
// interface that lives on its own server … This new page is allowed to talk
// to Lodge Ops directly and access the Booking Engine as a bonafide client.
// The API's between STO and Lodge Ops need to be very secure - no leakage."
//
// What this process does, and nothing else:
//   - serves the STO app (frontend/dist/sto-portal/browser) as static files;
//   - signs every call to Lodge Ops' /api/sto-portal/* with the PORTAL KEY
//     (X-Sto-Key / X-Sto-Ts / X-Sto-Sign, the same arithmetic as the engine
//     link) and forwards the signed-in user's own token on top;
//   - signs its calls to the Booking Engine with its OWN engine client key
//     (a bonafide client: availability, rate quotes, the calendar) — and only
//     for a browser that holds a session Lodge Ops has vouched for;
//   - rate-limits per IP, caps bodies, and never holds a secret in a page.
//
// Env:
//   PORT               listen port (default 3300)
//   LISTEN_HOST        bind address (optional)
//   DIST_DIR           the built app (default ../frontend/dist/sto-portal/browser)
//   LODGEOPS_URL       Lodge Ops API base, e.g. http://127.0.0.1:3000/api
//   STO_KEY/STO_SECRET the portal's key on the Lodge Ops STO page
//   CONFIG_PULL_MS     how often to pull configuration from Lodge Ops and
//                      report the heartbeat (default 60000)
//   Everything else (the engine, the engine client, the rate limit, session
//   hours, the public address) comes from Lodge Ops → Settings → STO Portal.
//   TRUSTED_PROXY      1 = take the client IP from X-Forwarded-For's last hop
import http, { createServer } from 'node:http';
import https from 'node:https';
import { readFile, stat } from 'node:fs/promises';
import { createHash, createHmac } from 'node:crypto';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3300;
const LISTEN_HOST = (process.env.LISTEN_HOST ?? '').trim();
const DIST_DIR = resolve(process.env.DIST_DIR || join(here, '..', '..', 'app', 'dist', 'sto-portal', 'browser'));
const LODGEOPS_URL = (process.env.LODGEOPS_URL ?? '').trim().replace(/\/+$/, '');
const STO_KEY = (process.env.STO_KEY ?? 'sto-portal').trim();
const STO_SECRET = process.env.STO_SECRET ?? '';
const TRUSTED_PROXY = (process.env.TRUSTED_PROXY ?? '1') !== '0';
// How often the portal asks Lodge Ops for its configuration and reports its
// heartbeat (the e2e rig sets it to seconds).
const CONFIG_PULL_MS = Math.max(1000, Number(process.env.CONFIG_PULL_MS) || 60_000);
// Everything below comes from Lodge Ops (Settings → STO Portal), pulled over
// the signed link on boot and every CONFIG_PULL_MS — the environment only
// knows how to reach Lodge Ops (Dave, 2026-09-05: "Move the Lodge Ops STO
// settings from .env to a settings and hub page").
const cfg = { engineUrl: '', clientKey: 'sto', clientSecret: '', rateLimit: 240, rateWindowMs: 60_000, sessionHours: 12, portalUrl: '', at: null };
const STARTED = Date.now();
const TIMEOUT_MS = 30_000;
const MAX_BODY = 64 * 1024;
// The Lodge Ops version this portal shipped with: deploy.sh writes VERSION
// beside server.mjs; a bare checkout falls back to package.json.
// The repo's VERSION file (single source of truth, synced into package.json
// by scripts/bump-version.mjs); deploy.sh installs a copy beside server.mjs.
let VERSION;
try { VERSION = (await readFile(join(here, 'VERSION'), 'utf8')).trim(); }
catch { try { VERSION = (await readFile(join(here, '..', '..', 'VERSION'), 'utf8')).trim(); } catch { VERSION = JSON.parse(await readFile(join(here, '..', 'package.json'), 'utf8')).version; } }

// ---- helpers ------------------------------------------------------------------
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json' };
const json = (res, status, body) => { const raw = JSON.stringify(body); res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(raw); };
const buckets = new Map();
function allow(ip, now = Date.now()) {
  if (buckets.size > 10_000) for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  let b = buckets.get(ip);
  if (!b || b.resetAt <= now) { b = { count: 0, resetAt: now + cfg.rateWindowMs }; buckets.set(ip, b); }
  b.count += 1;
  return b.count <= cfg.rateLimit;
}
function clientIp(req) {
  if (TRUSTED_PROXY) {
    const fwd = String(req.headers['x-forwarded-for'] ?? '');
    if (fwd) return fwd.split(',').pop().trim();
  }
  return req.socket?.remoteAddress ?? 'unknown';
}
function readBody(req, cap = MAX_BODY) {
  return new Promise((resolveBody, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > cap) { reject(new Error('too large')); req.destroy(); return; } chunks.push(c); });
    req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
function sign(secret, method, path, rawBody = '') {
  const ts = Math.floor(Date.now() / 1000);
  const bodyHash = createHash('sha256').update(rawBody).digest('hex');
  return { ts: String(ts), sig: createHmac('sha256', secret).update(`${ts}.${method}.${path}.${bodyHash}`).digest('hex') };
}
/** One signed HTTP call, answering { status, json, text }. */
function call(base, method, path, headers, rawBody = '') {
  return new Promise((resolveCall) => {
    let u;
    try { u = new URL(base + path); } catch { return resolveCall({ status: 0, json: null, text: '' }); }
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request(u, { method, headers: { ...headers, host: u.host, ...(rawBody ? { 'content-length': String(Buffer.byteLength(rawBody)) } : {}) }, timeout: TIMEOUT_MS }, (r) => {
      const chunks = [];
      r.on('data', (c) => chunks.push(c));
      r.on('end', () => { const text = Buffer.concat(chunks).toString('utf8'); let j = null; try { j = JSON.parse(text); } catch { /* not json */ } resolveCall({ status: r.statusCode ?? 0, json: j, text }); });
      r.on('error', () => resolveCall({ status: 0, json: null, text: '' }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', () => resolveCall({ status: 0, json: null, text: '' }));
    if (rawBody) req.write(rawBody);
    req.end();
  });
}
const apiPrefix = (base) => { try { return new URL(base).pathname.replace(/\/+$/, ''); } catch { return '/api'; } };

/** A call to Lodge Ops' STO routes, signed with the portal key; the user's token rides on top. */
function lodgeOps(method, path, { token, ip, body } = {}) {
  if (!LODGEOPS_URL || !STO_SECRET) return Promise.resolve({ status: 0, json: null, text: '' });
  const rawBody = body === undefined ? '' : JSON.stringify(body);
  const full = `${apiPrefix(LODGEOPS_URL)}/sto-portal${path}`;
  const { ts, sig } = sign(STO_SECRET, method, full, rawBody);
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Sto-Key': STO_KEY, 'X-Sto-Ts': ts, 'X-Sto-Sign': sig, 'X-Guest-Ip': ip ?? '' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return call(LODGEOPS_URL, method, `/sto-portal${path}`, headers, rawBody);
}
/** A call to the engine, signed as the portal's own client (from the pulled config). */
function engine(method, path, body) {
  if (!cfg.engineUrl || !cfg.clientSecret) return Promise.resolve({ status: 0, json: null, text: '' });
  const rawBody = body === undefined ? '' : JSON.stringify(body);
  const { ts, sig } = sign(cfg.clientSecret, method, path, rawBody);
  return call(cfg.engineUrl, method, path, { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Engine-Key': cfg.clientKey, 'X-Engine-Ts': ts, 'X-Engine-Sign': sig }, rawBody);
}

// ---- configuration from Lodge Ops, and the heartbeat back --------------------
/** Pull what Settings → STO Portal says; keep the last good answer if Lodge Ops is away. */
async function pullConfig() {
  const r = await lodgeOps('GET', '/config');
  if (r.status !== 200 || !r.json || typeof r.json.engineUrl !== 'string') {
    if (!cfg.at) console.warn(`[sto-portal] configuration not pulled from Lodge Ops (${r.status || 'unreachable'}) — no availability or rates until it is`);
    return false;
  }
  const j = r.json;
  const next = {
    engineUrl: String(j.engineUrl ?? '').trim().replace(/\/+$/, ''),
    clientKey: String(j.engineClientKey ?? 'sto').trim() || 'sto',
    clientSecret: String(j.engineClientSecret ?? ''),
    rateLimit: Math.max(1, Number(j.rateLimit) || 240),
    rateWindowMs: Math.max(1000, Number(j.rateWindowMs) || 60_000),
    sessionHours: Math.max(1, Number(j.sessionHours) || 12),
    portalUrl: String(j.portalUrl ?? '').trim(),
  };
  const changed = ['engineUrl', 'clientKey', 'clientSecret', 'rateLimit', 'rateWindowMs', 'portalUrl'].filter((k) => cfg[k] !== next[k]);
  Object.assign(cfg, next, { at: new Date().toISOString() });
  if (changed.length) console.log(`[sto-portal] configuration applied from Lodge Ops: ${changed.map((k) => (k === 'clientSecret' ? 'clientSecret (rotated)' : `${k}=${cfg[k]}`)).join(', ')}`);
  return true;
}
/** Is the engine answering us? Its /api/health is public. */
async function engineReachable() {
  if (!cfg.engineUrl) return false;
  const r = await call(cfg.engineUrl, 'GET', '/api/health', { Accept: 'application/json' }, '');
  return r.status === 200;
}
/** Report ourselves to Lodge Ops (version, uptime, whether we see the engine, when the config was applied). */
async function heartbeat() {
  const body = { version: VERSION, uptimeSec: Math.round((Date.now() - STARTED) / 1000), url: cfg.portalUrl, listen: `${LISTEN_HOST || '*'}:${PORT}`, engineReachable: await engineReachable(), configAt: cfg.at };
  const r = await lodgeOps('POST', '/heartbeat', { body });
  if (r.status !== 200) console.warn(`[sto-portal] heartbeat not accepted by Lodge Ops (${r.status || 'unreachable'})`);
}

// ---- sessions the engine may be asked for -----------------------------------
// The engine answers ANY signed client, so the portal only asks it on behalf
// of a browser Lodge Ops has vouched for: the user's token is checked with
// Lodge Ops (GET /me) once and remembered for a few minutes.
const vouched = new Map(); // token → { at, stoId, userId }
const VOUCH_MS = 5 * 60_000;
async function session(token, ip) {
  if (!token) return null;
  const hit = vouched.get(token);
  if (hit && Date.now() - hit.at < VOUCH_MS) return hit;
  const r = await lodgeOps('GET', '/me', { token, ip });
  if (r.status !== 200 || !r.json?.user?.id) { vouched.delete(token); return null; }
  const v = { at: Date.now(), stoId: r.json.company?.id, userId: r.json.user.id, discountPct: Number(r.json.company?.discountPct) || 0 };
  vouched.set(token, v);
  if (vouched.size > 5000) for (const [k, s] of vouched) if (Date.now() - s.at > VOUCH_MS) vouched.delete(k);
  return v;
}

// ---- the calendar merge (the same picture Lodge Ops' New booking page shows) ----
const ISO = /^\d{4}-\d{2}-\d{2}$/;
function daysBetween(from, to) { const out = []; for (let d = new Date(`${from}T00:00:00Z`); d.toISOString().slice(0, 10) < to; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10)); return out; }
async function calendar(q) {
  const { roomTypeId, from, to } = q;
  if (!roomTypeId || !ISO.test(from) || !ISO.test(to) || to <= from) return { status: 400, body: { message: 'A suite and a date span are needed.' } };
  if (daysBetween(from, to).length > 70) return { status: 400, body: { message: 'At most 70 nights per calendar.' } };
  const av = await engine('GET', `/api/engine/rate-engine/availability?from=${from}&to=${to}&roomTypeId=${encodeURIComponent(roomTypeId)}`);
  if (av.status === 0) return { status: 503, body: { message: 'The booking engine did not respond.' } };
  const plans = new Map();
  for (let start = from; start < to; ) {
    const d = new Date(`${start}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 31);
    const end = d.toISOString().slice(0, 10) < to ? d.toISOString().slice(0, 10) : to;
    const body = { roomTypeIds: [String(roomTypeId)], from: start, to: end, scan: true };
    for (const k of ['adults', 'children', 'infants']) { const n = Number(q[k]); if (Number.isFinite(n) && n >= 0) body[k] = Math.min(Math.trunc(n), 99); }
    const r = await engine('POST', '/api/engine/rates/quote', body);
    if (r.status === 0) return { status: 503, body: { message: 'The booking engine did not respond.' } };
    for (const p of Array.isArray(r.json?.plans) ? r.json.plans : []) {
      const entry = plans.get(p.id) ?? { id: p.id, name: p.name, nights: {} };
      for (const n of p.suites?.[roomTypeId]?.nights ?? []) if (n?.date) entry.nights[n.date] = { totalInclVat: Number.isFinite(Number(n.totalInclVat)) ? Number(n.totalInclVat) : null, closedToArrival: n.closedToArrival === true };
      plans.set(p.id, entry);
    }
    start = end;
  }
  const days = {};
  for (const date of daysBetween(from, to)) {
    const free = av.json?.suites?.[roomTypeId]?.[date] ?? null;
    const rates = {}; let cheapest = null; let closed = plans.size > 0;
    for (const p of plans.values()) { const n = p.nights[date]; rates[p.id] = n?.totalInclVat ?? null; if (n?.totalInclVat != null && (cheapest == null || n.totalInclVat < cheapest)) cheapest = n.totalInclVat; if (!n?.closedToArrival) closed = false; }
    days[date] = { free, rates, cheapest, closedToArrival: closed };
  }
  return { status: 200, body: { ok: true, roomTypeId, from, to, currency: 'ZAR', plans: [...plans.values()].map((p) => ({ id: p.id, name: p.name })), days } };
}

// ---- the server ----------------------------------------------------------------
const LO_ALLOW = /^\/(me|me\/password|summary|catalog|events\/search|price|holds|holds\/[A-Za-z0-9-]+|holds\/[A-Za-z0-9-]+\/(cancel|convert)|bookings|bookings\/[A-Za-z0-9-]+|bookings\/[A-Za-z0-9-]+\/cancel)$/;
const server = createServer(async (req, res) => {
  const url = req.url ?? '/';
  const method = (req.method ?? 'GET').toUpperCase();
  const ip = clientIp(req);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (url === '/health') { json(res, 200, { ok: true, version: VERSION, lodgeOps: !!(LODGEOPS_URL && STO_SECRET), engine: !!(cfg.engineUrl && cfg.clientSecret), configAt: cfg.at, engineUrl: cfg.engineUrl || null }); return; }

  if (url.startsWith('/api/')) {
    if (!allow(ip)) { json(res, 429, { code: 'RATE_LIMITED', message: 'Too many requests — slow down.' }); return; }
    const clean = url.split('?')[0];
    const query = url.includes('?') ? url.slice(url.indexOf('?')) : '';
    const auth = String(req.headers['authorization'] ?? '');
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    let body;
    if (method === 'POST' || method === 'PUT') {
      try { const raw = await readBody(req); body = raw ? JSON.parse(raw) : {}; } catch { json(res, 400, { code: 'BAD_BODY', message: 'The request body must be JSON under 64 KB.' }); return; }
    }
    // sign in — the one call without a token
    if (clean === '/api/auth/login' && method === 'POST') {
      const r = await lodgeOps('POST', '/auth/login', { ip, body: { email: body?.email, password: body?.password } });
      if (r.status === 0) { json(res, 503, { ok: false, message: 'Lodge Ops did not respond — please try again shortly.' }); return; }
      json(res, r.status === 200 ? 200 : r.status, r.json ?? { ok: false, message: 'Sign-in failed.' });
      return;
    }
    // everything else needs a session
    if (!token) { json(res, 401, { code: 'UNAUTHENTICATED', message: 'Please sign in.' }); return; }
    if (clean.startsWith('/api/lo/')) {
      const rest = clean.slice('/api/lo'.length);
      if (!LO_ALLOW.test(rest) || !(method === 'GET' || method === 'POST')) { json(res, 404, { code: 'NOT_FOUND', message: 'No such endpoint.' }); return; }
      const r = await lodgeOps(method, rest + query, { token, ip, body });
      if (r.status === 0) { json(res, 503, { code: 'UNAVAILABLE', message: 'Lodge Ops did not respond — please try again shortly.' }); return; }
      if (r.status === 401) vouched.delete(token);
      json(res, r.status, r.json ?? { message: r.text.slice(0, 200) });
      return;
    }
    if (clean.startsWith('/api/engine/')) {
      const s = await session(token, ip);
      if (!s) { json(res, 401, { code: 'UNAUTHENTICATED', message: 'Please sign in again.' }); return; }
      const params = new URLSearchParams(query.slice(1));
      if (clean === '/api/engine/availability' && method === 'GET') {
        const from = params.get('from') ?? '', to = params.get('to') ?? '';
        if (!ISO.test(from) || !ISO.test(to) || to <= from) { json(res, 400, { message: 'Check-out must be after check-in.' }); return; }
        const r = await engine('GET', `/api/engine/rate-engine/availability?from=${from}&to=${to}`);
        if (r.status === 0) { json(res, 503, { message: 'The booking engine did not respond.' }); return; }
        const suites = {};
        for (const [id, days] of Object.entries(r.json?.suites ?? {})) {
          let min = Infinity;
          for (const v of Object.values(days ?? {})) { if (v == null) { min = null; break; } if (v < min) min = v; }
          suites[id] = min === Infinity ? null : min;
        }
        json(res, 200, { ok: true, from, to, suites });
        return;
      }
      if (clean === '/api/engine/quote' && method === 'POST') {
        const q = { roomTypeIds: (Array.isArray(body?.roomTypeIds) ? body.roomTypeIds : []).map(String).slice(0, 20), from: String(body?.from ?? ''), to: String(body?.to ?? '') };
        for (const k of ['adults', 'children', 'infants']) { const n = Number(body?.[k]); if (Number.isFinite(n) && n >= 0) q[k] = Math.min(Math.trunc(n), 99); }
        if (!q.roomTypeIds.length || !ISO.test(q.from) || !ISO.test(q.to) || q.to <= q.from) { json(res, 400, { message: 'Suites and a stay are needed.' }); return; }
        const r = await engine('POST', '/api/engine/rates/quote', q);
        if (r.status === 0) { json(res, 503, { message: 'The booking engine did not respond.' }); return; }
        // Counted at Lodge Ops as an availability search (best effort).
        void lodgeOps('POST', '/events/search', { token, ip, body: { from: q.from, to: q.to, adults: q.adults ?? null, children: q.children ?? null, infants: q.infants ?? null, suites: q.roomTypeIds, results: Array.isArray(r.json?.plans) ? r.json.plans.length : 0 } });
        json(res, r.status, r.json ?? { message: 'The quote failed.' });
        return;
      }
      if (clean === '/api/engine/calendar' && method === 'GET') {
        const out = await calendar({ roomTypeId: params.get('roomTypeId') ?? '', from: params.get('from') ?? '', to: params.get('to') ?? '', adults: params.get('adults'), children: params.get('children'), infants: params.get('infants') });
        json(res, out.status, out.body);
        return;
      }
    }
    json(res, 404, { code: 'NOT_FOUND', message: 'No such endpoint.' });
    return;
  }

  // ---- the app ----
  if (method !== 'GET' && method !== 'HEAD') { json(res, 405, { message: 'GET only.' }); return; }
  let p = url.split('?')[0];
  try { p = decodeURIComponent(p); } catch { json(res, 400, { message: 'Bad path.' }); return; }
  if (p.includes('\0')) { json(res, 400, { message: 'Bad path.' }); return; }
  const root = DIST_DIR;
  let full = resolve(root, '.' + normalize('/' + p));
  if (full !== root && !full.startsWith(root + sep)) { json(res, 404, { message: 'No such page.' }); return; }
  try {
    const st = await stat(full);
    if (st.isDirectory()) full = join(full, 'index.html');
  } catch {
    full = join(root, 'index.html'); // the SPA's routes
  }
  try {
    const data = await readFile(full);
    const isIndex = full.endsWith('index.html');
    res.writeHead(200, { 'Content-Type': MIME[extname(full).toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': isIndex ? 'no-store' : 'public, max-age=31536000, immutable' });
    res.end(method === 'HEAD' ? undefined : data);
  } catch {
    json(res, 404, { message: `The STO app is not built (${root}).` });
  }
});
if (!LODGEOPS_URL || !STO_SECRET) console.warn('[sto-portal] LODGEOPS_URL / STO_SECRET not set — nobody can sign in and no configuration can be pulled.');
else await pullConfig();
server.listen(PORT, LISTEN_HOST || undefined, () => {
  console.log(`[sto-portal] v${VERSION} on ${LISTEN_HOST || '*'}:${PORT} — app ${DIST_DIR}; Lodge Ops ${LODGEOPS_URL || '(unset)'}; engine ${cfg.engineUrl || '(not configured yet — Settings → STO Portal)'}`);
  if (LODGEOPS_URL && STO_SECRET) {
    void heartbeat();
    setInterval(() => { void pullConfig().then(() => heartbeat()); }, CONFIG_PULL_MS).unref();
  }
});
