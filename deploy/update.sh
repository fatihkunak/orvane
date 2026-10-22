#!/usr/bin/env bash
# Orvane self-update for Linux/macOS. Started detached by the app (server/actions/update.ts) from a copy in the temp dir, so
# this file may change under us while it runs. Argument: $1 = repo root.
#
# The app is stopped BEFORE the build only when a supervisor we know how to drive exists (systemd unit "orvane" or a pm2 app
# named "orvane"). Otherwise the build runs while the app serves; that is survivable but the person is told to restart.
set -uo pipefail

REPO="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$REPO" || exit 1
mkdir -p deploy/logs
LOG="$REPO/deploy/logs/update.log"
exec >>"$LOG" 2>&1

say() { echo "[$(date -Is 2>/dev/null || date)] $*"; }
fail() { say "UPDATE FAILED: $* -- the app was NOT restarted; fix the problem and run the update again."; exit 1; }

say "===== update started (repo: $REPO)"
git rev-parse --short HEAD 2>/dev/null || true

say "[1/6] git pull --ff-only"
git pull --ff-only || fail "git pull (commit or stash local changes first)"

say "[2/6] npm ci"
npm ci || fail "npm ci"

say "[3/6] database backup"
node deploy/backup.mjs || fail "database backup"

say "[4/6] prisma migrate deploy"
npx prisma migrate deploy || fail "prisma migrate deploy"
npx prisma generate || fail "prisma generate"

# Which supervisor, if any, owns the running app?
SUPERVISOR=""
if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files 2>/dev/null | grep -q '^orvane\.service'; then
  SUPERVISOR="systemd"
elif command -v pm2 >/dev/null 2>&1 && pm2 describe orvane >/dev/null 2>&1; then
  SUPERVISOR="pm2"
fi

if [ "$SUPERVISOR" = "systemd" ]; then
  say "[5/6] stopping orvane.service"
  systemctl stop orvane || fail "systemctl stop"
elif [ "$SUPERVISOR" = "pm2" ]; then
  say "[5/6] stopping the pm2 app"
  pm2 stop orvane >/dev/null || fail "pm2 stop"
else
  say "[5/6] no systemd unit 'orvane' or pm2 app 'orvane': building while the app runs"
fi

# Logs can only be rotated while nothing holds them open (best effort: skipped when still locked)
node deploy/rotate-logs.mjs || true

say "[6/6] npm run build"
if ! npm run build; then
  # Bring back what we stopped, so a failed build does not leave the instance down
  [ "$SUPERVISOR" = "systemd" ] && systemctl start orvane
  [ "$SUPERVISOR" = "pm2" ] && pm2 start orvane >/dev/null
  fail "npm run build"
fi

if [ "$SUPERVISOR" = "systemd" ]; then
  systemctl start orvane || fail "systemctl start"
  say "restarted through systemd (orvane.service)"
elif [ "$SUPERVISOR" = "pm2" ]; then
  pm2 start orvane >/dev/null || fail "pm2 start"
  say "restarted through pm2"
else
  say "Update applied. Restart the app yourself (systemd, pm2, docker compose or your terminal)."
fi

say "===== update done"
