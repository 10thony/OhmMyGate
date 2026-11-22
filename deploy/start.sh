#!/usr/bin/env bash
# Bring up OhmMyGate (Clerk) + Funnel :443 /ohm.
# Never `tailscale funnel reset`.
set -euo pipefail
export PATH="/usr/local/bin:/usr/bin:/bin:${PATH:-}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -f "$ROOT/.env.local" ]]; then
  echo "Missing $ROOT/.env.local (TBR Clerk keys)" >&2
  exit 1
fi

for _ in $(seq 1 30); do
  docker info >/dev/null 2>&1 && break
  sleep 2
done
if ! docker info >/dev/null 2>&1; then
  echo "docker is not ready" >&2
  exit 1
fi

mkdir -p "$ROOT/Data/dp-keys"
docker compose up -d --build --remove-orphans

GATE_HEALTH_URL="${GATE_HEALTH_URL:-http://192.168.151.30:5370/ohm/api/health}"
ok=0
for _ in $(seq 1 60); do
  body="$(curl -s --max-time 2 "$GATE_HEALTH_URL" || true)"
  if [[ "$body" == *'"ok":true'* && "$body" == *'ohmmgate'* ]]; then
    ok=1
    break
  fi
  sleep 2
done
if [[ "$ok" != 1 ]]; then
  echo "OhmMyGate did not become ready on ${GATE_HEALTH_URL}" >&2
  docker compose logs --tail 120 ohmmgate || true
  exit 1
fi

# Caddyfile is bind-mounted; funnel-proxy has admin off — restart to pick up /ohm.
if docker ps --format '{{.Names}}' | grep -qx funnel-proxy; then
  docker restart funnel-proxy >/dev/null
  echo "funnel-proxy restarted"
else
  echo "WARN: funnel-proxy not running; Funnel /ohm will fail until edge is up" >&2
fi

edge_ok=0
for _ in $(seq 1 20); do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 http://127.0.0.1:8088/ohm/api/health || true)"
  if [[ "$code" == "200" || "$code" == "302" || "$code" == "401" ]]; then
    edge_ok=1
    break
  fi
  sleep 1
done
if [[ "$edge_ok" != 1 ]]; then
  echo "WARN: funnel-edge :8088 /ohm not answering; check Projects/Caddyfile + funnel-proxy" >&2
fi

echo "Local  http://192.168.151.30:5370/ohm  (Clerk required)"
echo "iOS    https://cobec-sv-01.tail336878.ts.net/ohm"
