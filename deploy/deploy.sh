#!/usr/bin/env bash
# ============================================================================
#  deploy.sh — build + install the STO portal on its host (ratebox).
#
#  Run as root from a deploy-only checkout of this repo, e.g.
#      /root/BookingEngine/LodgeITSTO/deploy/deploy.sh
#
#  What it does:
#    1. git pull --ff-only origin main            (deploy-only checkout)
#    2. npm ci + `ng build` in app/ (the Angular app)
#    3. rsync the built app, server.mjs and package.json into /opt/lodgeit-sto-portal
#       (the installed .env is never touched)
#    4. restart the lodgeit-sto-portal systemd service
#    5. verify /health: ok, version matches, the Lodge Ops link configured (the
#       engine link comes from Lodge Ops → Settings → STO Portal, warned if missing)
#
#  The portal has no database of its own and no migrations: everything it
#  shows comes from Lodge Ops (signed with the portal key) and the Booking
#  Engine (as engine client `sto`). Configuration lives ONLY in the .env.
#
#  Your shell stays wherever you ran it from — the script never changes the
#  caller's directory.
# ============================================================================
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_ROOT="/opt/lodgeit-sto-portal"
SERVICE="lodgeit-sto-portal"
UNIT_FILE="/etc/systemd/system/${SERVICE}.service"
ENV_FILE="${APP_ROOT}/.env"
SVC_USER="${SVC_USER:-oase}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "!! Run as root — this script writes ${APP_ROOT} and restarts ${SERVICE}." >&2
  exit 1
fi
if [[ ! -f "${REPO_DIR}/VERSION" || ! -f "${REPO_DIR}/server/src/server.mjs" || ! -f "${REPO_DIR}/app/angular.json" ]]; then
  echo "!! ${REPO_DIR} does not look like the STO portal repo (VERSION / server/src/server.mjs / app/angular.json missing)." >&2
  exit 1
fi
id "${SVC_USER}" >/dev/null 2>&1 || { echo "!! service account '${SVC_USER}' does not exist (adduser --system --group --home /opt --no-create-home --shell /usr/sbin/nologin ${SVC_USER})" >&2; exit 1; }

# The port and the one address the portal listens on — from the installed
# .env, defaults 3300 on every interface.
PORT=3300
LISTEN_HOST=
if [[ -f "${ENV_FILE}" ]]; then
  PORT="$(grep -E '^PORT=' "${ENV_FILE}" | tail -1 | cut -d= -f2 || true)"
  PORT="${PORT:-3300}"
  LISTEN_HOST="$(grep -E '^LISTEN_HOST=' "${ENV_FILE}" | tail -1 | cut -d= -f2 || true)"
fi
PROBE_HOST="${LISTEN_HOST:-127.0.0.1}"

health_field() {  # health_field <json> <field>  → value or empty
  node -e '
    try {
      const j = JSON.parse(process.argv[1]);
      const v = j[process.argv[2]];
      if (v !== undefined && v !== null) console.log(v);
    } catch {}
  ' "$1" "$2"
}

# ---- 1. Pull, showing what changed ----
echo "==> Pulling main into ${REPO_DIR}…"
OLD_HEAD="$(git -C "${REPO_DIR}" rev-parse HEAD)"
git -C "${REPO_DIR}" pull --ff-only --quiet origin main || {
  echo "!! Pull refused to fast-forward. This checkout is deploy-only — never" >&2
  echo "!! commit or edit here. Fix the divergence; do not force through."     >&2
  exit 1
}
NEW_HEAD="$(git -C "${REPO_DIR}" rev-parse HEAD)"
if [[ "${OLD_HEAD}" == "${NEW_HEAD}" ]]; then
  echo "==> Already up to date: $(git -C "${REPO_DIR}" log -1 --format='%h %s')"
else
  echo "==> New commits:"
  git -C "${REPO_DIR}" --no-pager log --oneline --no-decorate "${OLD_HEAD}..${NEW_HEAD}"
  echo "==> Files changed:"
  git -C "${REPO_DIR}" --no-pager diff --stat "${OLD_HEAD}" "${NEW_HEAD}"
fi
APP_VERSION="$(cat "${REPO_DIR}/VERSION")"
echo "==> Deploying STO portal v${APP_VERSION}"

# ---- 2. Build the Angular app ----
# npm ci only when the lockfile changed (or FORCE_CI=1) — an ARM box takes
# a few minutes over the Angular toolchain.
echo "==> Building the portal app (app/: npm ci + ng build)…"
STAMP="${REPO_DIR}/app/node_modules/.lock-stamp"
LOCK_SUM="$(sha256sum "${REPO_DIR}/app/package-lock.json" | cut -d' ' -f1)"
if [[ "${FORCE_CI:-0}" == "1" || ! -d "${REPO_DIR}/app/node_modules" || "$(cat "${STAMP}" 2>/dev/null || true)" != "${LOCK_SUM}" ]]; then
  (cd "${REPO_DIR}/app" && npm ci --no-audit --no-fund --silent)
  echo "${LOCK_SUM}" > "${STAMP}"
else
  echo "==> node_modules matches package-lock.json — npm ci skipped (FORCE_CI=1 to force)"
fi
(cd "${REPO_DIR}/app" && npm run build --silent)
BUILT="${REPO_DIR}/app/dist/sto-portal/browser"
[[ -f "${BUILT}/index.html" ]] || { echo "!! Build produced no ${BUILT}/index.html" >&2; exit 1; }

# ---- 3. Install ----
echo "==> Installing into ${APP_ROOT}…"
mkdir -p "${APP_ROOT}/browser"
rsync -a --delete "${BUILT}/" "${APP_ROOT}/browser/"
install -m 644 "${REPO_DIR}/server/src/server.mjs" "${APP_ROOT}/server.mjs"
install -m 644 "${REPO_DIR}/server/package.json" "${APP_ROOT}/package.json"
printf '%s\n' "${APP_VERSION}" > "${APP_ROOT}/VERSION"
chown -R "${SVC_USER}:${SVC_USER}" "${APP_ROOT}"

# ---- 4. First-run gates: .env and the unit ----
if [[ ! -f "${ENV_FILE}" ]]; then
  cat >&2 <<EOF
!! ${ENV_FILE} does not exist. Files are installed, but the service was NOT
!! (re)started. Create it from the example and fill it in:
     install -o ${SVC_USER} -g ${SVC_USER} -m 600 ${REPO_DIR}/deploy/sto.env.example ${ENV_FILE}
     vi ${ENV_FILE}     # LODGEOPS_URL, STO_KEY, STO_SECRET (Lodge Ops → Settings → STO Portal); everything else is pulled from there
!! then run this script again.
EOF
  exit 1
fi
chown "${SVC_USER}:${SVC_USER}" "${ENV_FILE}"
chmod 600 "${ENV_FILE}"
if [[ ! -f "${UNIT_FILE}" ]]; then
  echo "!! ${UNIT_FILE} does not exist — install it from this repo:"                 >&2
  echo "     cp ${REPO_DIR}/deploy/lodgeit-sto-portal.service ${UNIT_FILE}"          >&2
  echo "     systemctl daemon-reload && systemctl enable ${SERVICE}"                 >&2
  echo "!! then run this script again."                                             >&2
  exit 1
fi

# ---- 5. Restart + verify ----
echo "==> Restarting ${SERVICE}…"
systemctl restart "${SERVICE}"

echo "==> Waiting for /health on ${PROBE_HOST}:${PORT}…"
HEALTH=""
for _ in $(seq 1 15); do
  sleep 1
  HEALTH="$(curl -s --max-time 2 "http://${PROBE_HOST}:${PORT}/health" || true)"
  [[ -n "${HEALTH}" ]] && break
done
if [[ -z "${HEALTH}" ]]; then
  echo "!! The portal did not answer /health within 15s. Check:" >&2
  echo "     journalctl -u ${SERVICE} --since '2 min ago' --no-pager" >&2
  exit 1
fi

OK="$(health_field "${HEALTH}" ok)"
LIVE_VERSION="$(health_field "${HEALTH}" version)"
LO_OK="$(health_field "${HEALTH}" lodgeOps)"
ENGINE_OK="$(health_field "${HEALTH}" engine)"
echo "==> Health: ok=${OK:-?} version=${LIVE_VERSION:-?} lodgeOps=${LO_OK:-?} engine=${ENGINE_OK:-?}"

FAIL=0
if [[ "${OK}" != "true" ]]; then echo "!! Health reports ok=${OK:-false}." >&2; FAIL=1; fi
if [[ "${LIVE_VERSION}" != "${APP_VERSION}" ]]; then echo "!! Running version ${LIVE_VERSION:-?} ≠ deployed ${APP_VERSION}." >&2; FAIL=1; fi
if [[ "${LO_OK}" != "true" ]]; then echo "!! LODGEOPS_URL or STO_SECRET is not set in ${ENV_FILE} — nobody can sign in." >&2; FAIL=1; fi
if [[ "${ENGINE_OK}" != "true" ]]; then echo "!! The portal has no engine link yet — set it on Lodge Ops → Settings → STO Portal (engine URL + Create client secret); the portal picks it up within a minute." >&2; fi
if (( FAIL )); then
  echo "!! Deploy finished but the portal is not healthy — see above." >&2
  exit 1
fi
echo "==> Done. STO portal v${APP_VERSION} is live on ${PROBE_HOST}:${PORT}."
