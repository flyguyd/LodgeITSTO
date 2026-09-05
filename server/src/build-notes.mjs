/**
 * Build notes — one entry per shipped version, newest LAST, the Lodge Ops
 * convention carried over: never extend an already-shipped key, the appending
 * diff must show zero removed lines, and `node -e "import('./server/src/build-notes.mjs')
 * .then(m => console.log(m.BUILD_NOTES.length))"` must parse after every append.
 */

export const BUILD_NOTES = [
  {
    key: '0.1.0',
    version: '0.1.0',
    date: '2026-09-05T12:00:00+02:00',
    changes: [
      {
        headline:
          'The STO portal becomes its own product (Dave, 2026-09-05: “move the STO site to the LodgeITSTO repo”). Split out of the Lodge Ops repo, where it shipped as sto-portal/ + frontend/projects/sto-portal in Lodge Ops 1.3.54–1.3.55: the Specialist Tour Operators’ portal — sign in, a pinned command bar, New booking with the operator’s discounted plan card and the two-month availability calendar, Holds and Bookings with slide-outs, Account — and the small Node service that serves it and is the ONLY thing an operator’s browser talks to. Functionally identical to what Lodge Ops 1.3.55 shipped; the change is where it lives and how it is built and deployed.',
        detail:
          'LAYOUT: app/ is a standalone Angular 20 workspace (single project sto-portal, `npm run build` → app/dist/sto-portal/browser) carrying its OWN copies of the three Lodge Ops shared pieces it used (app/src/app/shared/standard-grid.component.ts, grid-sort.ts, slideout-exit.ts) and of Lodge Ops’ styles.scss (the Organic palette + oa-* vocabulary) — the portal must build without Lodge Ops; keep those in step by hand. server/src/server.mjs is the service (node built-ins only): serves the built app, signs every /api/lo/* call to Lodge Ops’ /api/sto-portal/* with the PORTAL KEY (X-Sto-Key / X-Sto-Ts / X-Sto-Sign, HMAC over ts.METHOD.path.sha256(body)) plus the user’s Bearer token, relays ONLY its allow-list, asks the Booking Engine (as engine client `sto`) for availability / a quote / the calendar only for a session Lodge Ops has vouched for (GET /me, remembered 5 min), rate-limits per client IP, and reports {ok, version, lodgeOps, engine} on /health. VERSION is read from a VERSION file beside server.mjs (installed by deploy.sh), else the repo root, else package.json. DEPLOY: deploy/deploy.sh (root, from a deploy-only clone at /root/BookingEngine/LodgeITSTO): git pull --ff-only, npm ci in app/ only when package-lock.json changed (sha256 stamp; FORCE_CI=1), ng build, rsync the build + server.mjs + package.json + VERSION into /opt/lodgeit-sto-portal, gates on /opt/lodgeit-sto-portal/.env (deploy/sto.env.example) and the unit (deploy/lodgeit-sto-portal.service, User=oase), restarts lodgeit-sto-portal and fails unless /health says ok, the right version, lodgeOps=true and engine=true. WIRING ONLY in the env: PORT, LISTEN_HOST, TRUSTED_PROXY, DIST_DIR, LODGEOPS_URL, STO_KEY, STO_SECRET, ENGINE_URL, CLIENT_KEY, CLIENT_SECRET, RATE_LIMIT, RATE_WINDOW_MS. VERIFIED on the Lodge Ops e2e rig (STO_DIR points at this checkout; case 95, 85 checks, incl. Chromium against this build).',
      },
    ],
  },
];
