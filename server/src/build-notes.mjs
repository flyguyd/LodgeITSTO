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
  {
    key: '0.1.1',
    version: '0.1.1',
    date: '2026-09-05T12:46:22+02:00',
    changes: [
      {
        headline:
          'The portal is configured from Lodge Ops, not from its .env (Dave, 2026-09-05: \u201cMove the Lodge Ops STO settings from .env to a settings and hub page\u201d). The environment keeps only the road to Lodge Ops \u2014 PORT, LISTEN_HOST, TRUSTED_PROXY, DIST_DIR, LODGEOPS_URL, STO_KEY, STO_SECRET (and CONFIG_PULL_MS). Which engine to ask, the engine client the portal signs as and its secret, the rate limit, session hours and the public address all come from Lodge Ops \u2192 Settings \u2192 STO Portal, pulled on boot and every minute; the portal reports a heartbeat back so that page shows it is up, which version, and whether it can see the engine.',
        detail:
          'server.mjs: ENGINE_URL, CLIENT_KEY, CLIENT_SECRET, RATE_LIMIT and RATE_WINDOW_MS are gone from the environment; a mutable cfg {engineUrl, clientKey, clientSecret, rateLimit, rateWindowMs, sessionHours, portalUrl, at} is filled by pullConfig() \u2014 GET /api/sto-portal/config on Lodge Ops, signed with the portal key like every other call \u2014 awaited before listen() and again every CONFIG_PULL_MS (default 60 000, floor 1 000); the last good answer is kept when Lodge Ops is away, and changes are logged (the secret only as \'rotated\'). engine() signs with cfg; allow() rate-limits with cfg; heartbeat() POSTs {version, uptimeSec, url: cfg.portalUrl, listen, engineReachable (GET <engine>/api/health = 200), configAt} to /api/sto-portal/heartbeat after every pull. /health now also carries configAt and engineUrl. deploy/deploy.sh no longer fails when the engine link is missing \u2014 it says where to set it (Settings \u2192 STO Portal). deploy/sto.env.example, README and CLAUDE.md rewritten for the new split. Requires Lodge Ops 1.3.57 (migration 390). VERIFIED on the Lodge Ops e2e rig: case 95 (config pull signed / unsigned, heartbeat, a client-secret rotation from Lodge Ops picked up on the next pull, the hub page in Chromium).',
      },
    ],
  },
  {
    key: '0.1.2',
    version: '0.1.2',
    date: '2026-09-05T14:46:52+02:00',
    changes: [
      {
        headline:
          'The portal sells on ONE channel and nothing else (Dave, 2026-09-05: \u201cThe STO booking site must only query availability and rates using the STO Channel\u201d). Every rate, every free-unit count and every calendar figure an operator sees now comes from the STO channel Lodge Ops assigns, asked of the Booking Engine in one signed call. The website\u2019s rate plans are no longer reachable from here at all, and with no channel assigned the portal quotes nothing and says the lodge has not finished setting it up \u2014 a silent fall back to the public price is exactly the failure this removes. Operators see one price card, named for their channel.',
        detail:
          'server.mjs: the pulled configuration gains channelId (Lodge Ops 1.3.58, GET /api/sto-portal/config), logged like the rest when it changes. NEW channelQuote({roomTypeIds, from, to, adults, children, infants, scan}) \u2014 POST /api/engine/rates/channel-quote (engine 0.1.83) signed as the portal\u2019s client, naming cfg.channelId; no channel returns 503 NO_CHANNEL with the operator-facing wording and never calls the engine. /api/engine/availability now derives its {suites: {id: unitsFree}} from a scan-declared channel quote with NO suites named (the engine answers for every suite with a root) and returns the channel beside it, replacing the raw /api/engine/rate-engine/availability read. /api/engine/quote returns {stayNights, channel, plans:[ONE card]} where the card carries the CHANNEL\u2019s name and its source plan\u2019s id \u2014 the app\u2019s existing plan-card rendering is unchanged, and a booking still names a plan Lodge Ops and the engine both know. /api/engine/calendar is rebuilt from channel quotes in 31-night chunks, each night\u2019s rate from the quote\u2019s nights and its free units from the quote\u2019s nightsFree, so the calendar has no second road to availability either. The three retired calls (/api/engine/rate-engine/availability and /api/engine/rates/quote) appear nowhere in the server any more. Requires Lodge Ops 1.3.58 and engine 0.1.83. VERIFIED on the Lodge Ops e2e rig (case 95, 98 checks): the channel named in availability and the quote, a third adult NOT carrying the website\u2019s additional-guest charge, and both Lodge Ops and the portal refusing to quote when the channel is unset.',
      },
    ],
  },
];
