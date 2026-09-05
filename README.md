# LodgeIT STO portal

The Specialist Tour Operators' own site for 7 Star Lodges: a small Node server
(`server/src/server.mjs`, built-ins only) that serves the Angular app in `app/`
and is the ONLY thing the operators' browsers talk to. Split out of the Lodge
Ops repo on 2026-09-05; Lodge Ops (1.3.54+) owns the operators, users, holds
and bookings and exposes them to this service on `/api/sto-portal/*`.

```
browser ──► server/src/server.mjs ─► Lodge Ops  /api/sto-portal/*  (signed with the portal key + the user's token)
                                  └─► Booking Engine  availability / quote / calendar  (signed as engine client `sto`)
```

- **Lodge Ops** owns the operators, their users and passwords, the discount,
  the holds and the bookings. Every call from the portal server carries
  `X-Sto-Key / X-Sto-Ts / X-Sto-Sign` (HMAC of `ts.METHOD.path.sha256(body)`,
  5-minute skew) — a browser can never reach those routes directly — and the
  signed-in user's Bearer token on top. Only the allow-listed paths are
  relayed (`/api/lo/...`).
- **The Booking Engine** is asked only for what the New booking page shows
  (availability, a quote, the calendar), and only for a browser Lodge Ops has
  vouched for (the token is checked against `GET /me` and remembered 5 min).
  Holds and bookings never go to the engine from here — Lodge Ops takes the
  nights and makes the reservation.
- No card details, no payments (later, and through the rate engine).

## Run it

On the portal host (ratebox), from a deploy-only clone of this repo:

```
git clone https://github.com/flyguyd/lodgeitsto.git /root/BookingEngine/LodgeITSTO
cp /root/BookingEngine/LodgeITSTO/deploy/lodgeit-sto-portal.service /etc/systemd/system/
systemctl daemon-reload && systemctl enable lodgeit-sto-portal
mkdir -p /opt/lodgeit-sto-portal
install -o oase -g oase -m 600 /root/BookingEngine/LodgeITSTO/deploy/sto.env.example /opt/lodgeit-sto-portal/.env
vi /opt/lodgeit-sto-portal/.env             # LODGEOPS_URL, STO_KEY, STO_SECRET — nothing else
/root/BookingEngine/LodgeITSTO/deploy/deploy.sh
```

`deploy/deploy.sh` pulls main, runs `npm ci` + `ng build` in `app/` (npm ci
only when the lockfile changed), installs the built app, `server.mjs` and a
`VERSION` file into `/opt/lodgeit-sto-portal`, restarts the unit and checks
`/health` (ok, version, both links configured). Re-run it for every deploy.
For a local run: `cd app && npm ci && npm run build`, then
`node server/src/server.mjs` with the env in the shell.

Environment: see `deploy/sto.env.example`. `GET /health` says whether both links are
configured, and when the configuration was last pulled. Rate-limited per
client IP with the limit set on Lodge Ops.

## Setting it up, once

1. Lodge Ops → **Settings → STO Portal**: **Create secret** → paste into
   `STO_SECRET` (the key id is `STO_KEY`). Set the portal address there too.
2. On the same page: the engine URL (empty = the engine Lodge Ops uses) and
   **Create client secret** — Lodge Ops registers the `sto` client on the
   engine and hands the secret to the portal on its next pull. It is never
   shown and never goes in a file.
3. Create the operators and their users on the STO page; they sign in at `/login`.

The portal pulls its configuration (`GET /api/sto-portal/config`, signed
with the portal key) on boot and every minute, and reports a heartbeat
(`POST /api/sto-portal/heartbeat`) that the settings page shows: version,
uptime, whether it sees the engine, when it applied its config.

## Keeping it in step with Lodge Ops

`app/src/app/shared/` (standard grid, grid-sort, slideout-exit) and
`app/src/styles.scss` are copies of Lodge Ops' files, taken when the portal
became its own repo. The portal builds without Lodge Ops; when those change
there, carry the change across by hand.
