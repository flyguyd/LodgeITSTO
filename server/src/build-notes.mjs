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
  {
    key: '0.1.3',
    version: '0.1.3',
    date: '2026-09-05T16:50:09+02:00',
    changes: [
      {
        headline:
          'Every rate the portal asks for now carries the operator\'s key, so the rate engine prices that operator itself \u2014 and the price card shows both figures (Dave, 2026-09-05: \u201cOn the portal when showing a rate total, so the STO discounted rate and below show in a smaller font the original rack rate with a strike through\u201d). The operator\'s price is the large figure; beneath it, smaller and struck through, the lodge\'s published rate with the percentage off. The same pairing appears on the booking summary and in each calendar cell. The key belongs to the SERVER: it signs the engine quote with it and strips it out of anything a browser sees.',
        detail:
          'server.mjs: the session vouch now remembers the operator\'s key from Lodge Ops\' /me (portalKey, Lodge Ops 1.3.59) and channelQuote() sends it as stoKey on every availability, quote and calendar call (engine 0.1.85). THE KEY NEVER REACHES A BROWSER \u2014 the /api/lo/ relay strips portalKey out of the /me answer on its way back, so the page holds the company and the discount percentage but nothing that names the operator to the engine. /api/engine/quote passes the engine\'s sto {applied, discountPct} through beside the one price card; /api/engine/calendar shows the operator\'s nightly figure as the cell\'s rate with the channel\'s own beside it as rack, both from the quote\'s stoTotalInclVat and totalInclVat. app: QuoteSuite gains sto {discountPct, rateTotal, vatTotal, grandTotal} and CalendarDay gains rack. New-booking prices from the ENGINE\'s operator figure (stoSum()) rather than multiplying the rack by a percentage locally \u2014 the local arithmetic survives only as a fallback for a quote with no operator figure. The card renders the operator\'s total in .nb-plan-total with the rack beneath in .nb-plan-rack as <s>\u2026</s> plus a \u201cn% off\u201d label; the booking summary\'s \u201cYour price\u201d gains the same struck-through rack line; a calendar cell shows the rack struck through under the nightly when the two differ. The gap between the struck figure and the \u201c% off\u201d label is a CSS margin, not a space in the template: Angular collapses whitespace between inline elements (preserveWhitespaces is off) and the first build shipped \u201cR13,800.0010% off\u201d \u2014 the e2e check now measures that gap so it cannot come back. Requires Lodge Ops 1.3.59 and engine 0.1.85. VERIFIED on the Lodge Ops e2e rig (case 95, 108 checks) including a Chromium check that the rack figure sits BELOW the price, in a smaller font, with line-through, and that /me through the portal carries no key.',
      },
    ],
  },
  {
    key: '0.1.4',
    version: '0.1.4',
    date: '2026-09-06T06:55:00+02:00',
    changes: [
      {
        headline:
          'What this rate includes, what comes back if it is cancelled, and a calendar you can click the stay out on (Dave, 2026-09-06 — the same three asks as Lodge Ops’ own New booking page, so the two look and behave alike). Each price card carries an “i” in its top right corner that opens what the rate includes and what it does not; the card also states the refund terms in the same sentence the booking website writes. In the availability calendar, clicking a night and then another moves the stay to those dates — either order — and Nights, the price card and the summary all follow. ALSO FIXED: every rate in that calendar read zero.',
        detail:
          'Pairs with Lodge Ops 1.3.60; no engine change. THE ZERO-RATE BUG: the calendar keyed each day’s rates by the CHANNEL’s id while the app looks a day’s rate up by the id its price card carries — the channel’s SOURCE PLAN. On the e2e rig the two happen to both be 1, which hid it completely; the merge now keys by planId || id, the same value the price card is given, and the e2e check reads the figure out of the cell rather than counting cells. A second bug in the same cell: the app was applying the operator’s discount to a rate the engine had already discounted, so a cell showed the discount twice — it now draws what the server sends. WHAT THIS RATE INCLUDES: the server pulls GET /api/engine/plan-inclusions (Lodge Ops’ own words, replicated to the engine), caches them five minutes and attaches the plan’s included/excluded to the one price card; QuoteSuite gains inclusionsAdded/inclusionsRemoved, and openInclusions() merges the plan’s list with the rule-driven changes for THIS stay (case-folded, removals win) so a rule that drops the spa credit strikes it through under “Not included”. The “i” is a SIBLING button of the card, never nested inside it — a button inside a button makes the whole card unclickable. REFUND TERMS: QuoteSuite gains refundable and refundLabel() is the booking site’s core.js sentence ported verbatim, so an operator and a guest never read different terms for the same rate; several suites that disagree say “Refund terms vary by suite”. CLICK THE STAY OUT: the calendar day cells are BUTTONS now (browser button styling reset back to the card look, past days disabled); the first click marks the first NIGHT and the hint changes, a second click on the last night sets check-in and check-out (the morning after the last night, so the outlined cells are exactly the nights paid for), the same night twice is a one-night stay, either order works. Escape closes the inclusions modal first, then the calendar. VERIFIED on the Lodge Ops e2e rig (case 95, 115 checks): 95.32b the plan’s inclusions and the refund policy on the quote, 95.92c the refund sentence on the card, 95.92d/e the modal and its ✕, 95.93 every requested night showing R4,140 over a struck-through R4,600 with “3 free”, 95.93b/c/d the two-click stay in both orders. Full suite green (531).',
      },
    ],
  },
];