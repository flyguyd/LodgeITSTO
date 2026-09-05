# LodgeIT STO portal

The Specialist Tour Operators' booking portal for 7 Star Lodges: an Angular
app and the small Node service that serves it. A separate product from Lodge
Ops (`flyguyd/LodgeOps`), the Booking Engine (`flyguyd/LodgeITBookingEngine`)
and the booking website (`flyguyd/LodgeITBookingWebsite`), operated with the
same build discipline.

```
app/      Angular 20 workspace (standalone components, signals) → app/dist/sto-portal/browser
server/   zero-dependency Node service: serves app/, signs calls to Lodge Ops
          (portal key) and the Booking Engine (engine client `sto`)
deploy/   deploy.sh, systemd unit, sto.env.example
scripts/  bump-version.mjs
```

## Architecture rules

- **An operator's browser only ever talks to this service.** Lodge Ops owns
  the operators, users, passwords, discount, holds and bookings; every call
  the service makes to Lodge Ops' `/api/sto-portal/*` is signed with the
  portal key (`X-Sto-Key / X-Sto-Ts / X-Sto-Sign`, HMAC over
  `ts.METHOD.path.sha256(body)`, 5-minute skew) with the signed-in user's
  token on top, and only the allow-list in `LO_ALLOW` is relayed.
- **The engine is asked only for what the New booking page shows**
  (availability, a quote, the calendar), signed as engine client `sto`, and
  only for a session Lodge Ops has vouched for. Holds and reservations are
  made by Lodge Ops, never from here. Nothing is written to Cloudbeds.
- **No payments here, no card details** (later, through the rate engine).
- **Only wiring in the environment** (`deploy/sto.env.example`). Business
  configuration comes from Lodge Ops.
- **The app builds without Lodge Ops.** `app/src/app/shared/` and
  `app/src/styles.scss` are COPIES of Lodge Ops' standard grid, grid-sort,
  slideout-exit and global styles. Keep them in step by hand when Lodge Ops
  changes them; never import across repos.
- Angular 20 conventions as in Lodge Ops: signal writes inside `effect()`
  go through `untracked()`; `strictTemplates` is on, keyed lookups live in
  typed methods; `[ngModel]` on selects whose options arrive later.

## Definition of done — EVERY delivery batch (same as Lodge Ops)

1. **Version bump**: `node scripts/bump-version.mjs` (no argument — patch
   only; `minor` / `major` only when Dave asks). Syncs VERSION and the three
   package.json files. Re-read VERSION first.
2. **Build note**: append ONE entry to the END of `server/src/build-notes.mjs`,
   keyed to the new version; diff shows 0 removed lines; then
   `node -e "import('./server/src/build-notes.mjs').then(m=>console.log(m.BUILD_NOTES.length))"`
   must parse.
3. **Verification**: `cd app && npm run build` clean; `node --check
   server/src/server.mjs`; anything touching the Lodge Ops or engine links
   exercised on the Lodge Ops e2e rig (`bash e2e/rig/up.sh` there with this
   checkout beside it as `../lodgeitsto`, then `node e2e/run.mjs 95`).
4. **Self-check** this list before saying "done".

## Running it

```bash
cd app && npm ci && npm run build
PORT=3300 LODGEOPS_URL=http://127.0.0.1:3000/api STO_KEY=sto-portal STO_SECRET=... \
ENGINE_URL=http://127.0.0.1:3100 CLIENT_KEY=sto CLIENT_SECRET=... node server/src/server.mjs
```

The portal key and secret come from Lodge Ops → STO → *The STO portal* card
(the secret is shown once); the `sto` engine client is created on the Lodge
Ops Booking Engine page (Service clients card), never by hand in the engine
database. Deploying: `deploy/deploy.sh` on the portal box (see README.md).
