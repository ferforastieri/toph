#!/usr/bin/env bash
set -euo pipefail

REPO="${TOPH_REPO:-ferforastieri/toph}"
VERSION="${TOPH_VERSION:-latest}"
PORT="${TOPH_PORT:-8787}"
WORKSPACES="${TOPH_WORKSPACES_DIR:-/srv/toph/workspaces}"
DATA_DIR="${TOPH_DATA_DIR:-/var/lib/toph}"
ENV_FILE="${TOPH_ENV_FILE:-/etc/toph/toph.env}"
SERVICE=/etc/systemd/system/toph.service
SERVICE_USER="${TOPH_SERVICE_USER:-${SUDO_USER:-}}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this installer as root (sudo)." >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1 || ! command -v openssl >/dev/null 2>&1; then
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    ca-certificates curl openssl
fi

if [ "$VERSION" = "latest" ]; then
  VERSION="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
    | sed -n 's/.*"tag_name":[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
fi
if [ -z "$VERSION" ]; then
  echo "Could not determine the latest Toph release." >&2
  exit 1
fi

ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64) ASSET="toph-linux-amd64" ;;
  aarch64|arm64) ASSET="toph-linux-arm64" ;;
  *) echo "Unsupported architecture: $ARCH" >&2; exit 1 ;;
esac

URL="https://github.com/${REPO}/releases/download/${VERSION}/${ASSET}"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

echo "Downloading Toph ${VERSION} (${ARCH})..."
curl -fL --retry 3 --retry-delay 2 "$URL" -o "$TMP"

EXISTING=0
if [ -f "$SERVICE" ] || [ -f "$ENV_FILE" ]; then
  EXISTING=1
fi

if [ -f "$ENV_FILE" ]; then
  ADDR="$(sed -n 's/^TOPH_ADDR=//p' "$ENV_FILE" | tail -n 1)"
  if [ -n "$ADDR" ]; then
    PORT="${ADDR##*:}"
  fi
  ENV_DATA_DIR="$(sed -n 's/^TOPH_DATA_DIR=//p' "$ENV_FILE" | tail -n 1)"
  if [ -n "$ENV_DATA_DIR" ]; then
    DATA_DIR="$ENV_DATA_DIR"
  fi
  ENV_WORKSPACES="$(sed -n 's/^TOPH_WORKSPACES=//p' "$ENV_FILE" | tail -n 1)"
  if [ -n "$ENV_WORKSPACES" ]; then
    WORKSPACES="$ENV_WORKSPACES"
  fi
fi

if [ -z "$SERVICE_USER" ] && [ -f "$SERVICE" ]; then
  SERVICE_USER="$(sed -n 's/^User=//p' "$SERVICE" | tail -n 1)"
fi
if [ -z "$SERVICE_USER" ] || [ "$SERVICE_USER" = "root" ]; then
  if [ "$EXISTING" -eq 0 ]; then
    SERVICE_USER="toph"
  else
    echo "Could not determine the service user. Set TOPH_SERVICE_USER." >&2
    exit 1
  fi
fi
if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
  if [ "$EXISTING" -eq 1 ]; then
    echo "Service user ${SERVICE_USER} does not exist." >&2
    exit 1
  fi
  useradd --system --create-home --home-dir "$DATA_DIR" --shell /bin/bash "$SERVICE_USER"
fi
SERVICE_GROUP="${TOPH_SERVICE_GROUP:-$(id -gn "$SERVICE_USER")}"

if [ "$EXISTING" -eq 0 ]; then
  install -d -m 0755 -o "$SERVICE_USER" -g "$SERVICE_GROUP" "$DATA_DIR" "$WORKSPACES"
  install -d -m 0755 /etc/toph
fi

PREVIOUS_VERSION=""
HEALTH_URL="http://127.0.0.1:${PORT}/api/health"
if curl -fsS --max-time 3 "$HEALTH_URL" >/tmp/toph-existing-health.json 2>/dev/null; then
  PREVIOUS_VERSION="$(sed -n 's/.*"version":[[:space:]]*"\([^"]*\)".*/\1/p' /tmp/toph-existing-health.json | head -1)"
fi
rm -f /tmp/toph-existing-health.json

install -m 0755 "$TMP" /usr/local/bin/toph

if [ -f "$ENV_FILE" ]; then
  if grep -q '^TOPH_BUILD_ID=' "$ENV_FILE"; then
    sed -i "s|^TOPH_BUILD_ID=.*|TOPH_BUILD_ID=${VERSION}-$(date +%s)|" "$ENV_FILE"
  else
    echo "TOPH_BUILD_ID=${VERSION}-$(date +%s)" >> "$ENV_FILE"
  fi
else
  NEW_PASSWORD="$(openssl rand -base64 32 | tr -d '/+=' | cut -c1-28)"
  {
    echo "TOPH_ADDR=0.0.0.0:${PORT}"
    echo "TOPH_DATA_DIR=${DATA_DIR}"
    echo "TOPH_WORKSPACES=${WORKSPACES}"
    echo "TOPH_ADMIN_PASSWORD=${NEW_PASSWORD}"
    echo "TOPH_BUILD_ID=${VERSION}-$(date +%s)"
    echo "TOPH_SECURE_COOKIES=true"
    [ -n "${TOPH_TRUSTED_PROXIES:-}" ] && echo "TOPH_TRUSTED_PROXIES=${TOPH_TRUSTED_PROXIES}"
    [ -n "${TOPH_OPENCODE_URL:-}" ] && echo "TOPH_OPENCODE_URL=${TOPH_OPENCODE_URL}"
    [ -n "${TOPH_OPENCODE_AUTH:-}" ] && echo "TOPH_OPENCODE_AUTH=${TOPH_OPENCODE_AUTH}"
  } > "$ENV_FILE"
  chmod 0600 "$ENV_FILE"
fi

UNIT_TMP="$(mktemp)"
trap 'rm -f "$TMP" "$UNIT_TMP"' EXIT
cat > "$UNIT_TMP" <<UNIT
[Unit]
Description=Toph self-hosted workbench
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_GROUP}
EnvironmentFile=${ENV_FILE}
ExecStart=/usr/local/bin/toph
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=false
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
UNIT
install -m 0644 "$UNIT_TMP" "$SERVICE"

rollback() {
  echo "Toph did not become healthy; rolling back the binary." >&2
  set +e
  ROLLBACK_VERSION="${TOPH_ROLLBACK_VERSION:-$PREVIOUS_VERSION}"
  if [ -n "$ROLLBACK_VERSION" ]; then
    OLD_TMP="$(mktemp)"
    OLD_URL="https://github.com/${REPO}/releases/download/v${ROLLBACK_VERSION}/${ASSET}"
    if curl -fL --retry 2 "$OLD_URL" -o "$OLD_TMP"; then
      install -m 0755 "$OLD_TMP" /usr/local/bin/toph
      if [ -f "$ENV_FILE" ]; then
        sed -i "s|^TOPH_BUILD_ID=.*|TOPH_BUILD_ID=${ROLLBACK_VERSION}-$(date +%s)|" "$ENV_FILE"
      fi
      systemctl restart toph
      echo "Rolled back to ${ROLLBACK_VERSION}." >&2
    else
      echo "Could not download previous version ${ROLLBACK_VERSION}." >&2
    fi
    rm -f "$OLD_TMP"
  else
    echo "Previous version unknown; binary rollback was not possible." >&2
  fi
  exit 1
}

systemctl daemon-reload
systemctl enable toph >/dev/null
systemctl restart toph

for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
  rollback
fi

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo
echo "Toph ${VERSION} is running."
echo "  App:  http://${IP:-SERVER_IP}:${PORT}/app"
echo "  Data: ${DATA_DIR}"
echo "  Workspaces: ${WORKSPACES}"
echo "  Service user: ${SERVICE_USER}"
echo "  Service: systemctl status toph"
if [ "$EXISTING" -eq 0 ]; then
  echo
  echo "Initial admin password: ${NEW_PASSWORD:-generated}"
  echo "Store it now; it will not be printed again."
else
  echo
  echo "Existing application configuration preserved."
fi
