#!/usr/bin/env bash
set -euo pipefail

REPO="${TOPH_REPO:-ferforastieri/toph}"
VERSION="${TOPH_VERSION:-latest}"
PORT="${TOPH_PORT:-8787}"
WORKSPACES="${TOPH_WORKSPACES_DIR:-/srv/toph/workspaces}"
DATA_DIR="${TOPH_DATA_DIR:-/var/lib/toph}"
ENV_FILE="${TOPH_ENV_FILE:-/etc/toph/toph.env}"
SERVICE=/etc/systemd/system/toph.service

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

if ! id -u toph >/dev/null 2>&1; then
  useradd --system --create-home --home-dir "$DATA_DIR" --shell /bin/bash toph
fi

install -d -m 0755 -o toph -g toph "$DATA_DIR" "$WORKSPACES"
install -d -m 0755 /etc/toph

install -m 0755 "$TMP" /usr/local/bin/toph

NEW_PASSWORD=""
if [ ! -f "$ENV_FILE" ]; then
  NEW_PASSWORD="$(openssl rand -base64 32 | tr -d '/+=' | cut -c1-28)"
  {
    echo "TOPH_ADDR=0.0.0.0:${PORT}"
    echo "TOPH_DATA_DIR=${DATA_DIR}"
    echo "TOPH_WORKSPACES=${WORKSPACES}"
    echo "TOPH_ADMIN_PASSWORD=${NEW_PASSWORD}"
    echo "TOPH_BUILD_ID=${VERSION}-$(date +%s)"
    echo "TOPH_SECURE_COOKIES=false"
    [ -n "${TOPH_OPENCODE_URL:-}" ] && echo "TOPH_OPENCODE_URL=${TOPH_OPENCODE_URL}"
    [ -n "${TOPH_OPENCODE_AUTH:-}" ] && echo "TOPH_OPENCODE_AUTH=${TOPH_OPENCODE_AUTH}"
  } > "$ENV_FILE"
  chmod 0600 "$ENV_FILE"
fi

# Every install gets a new build id so open browser sessions can show the update toast.
if grep -q '^TOPH_BUILD_ID=' "$ENV_FILE"; then
  sed -i "s|^TOPH_BUILD_ID=.*|TOPH_BUILD_ID=${VERSION}-$(date +%s)|" "$ENV_FILE"
else
  echo "TOPH_BUILD_ID=${VERSION}-$(date +%s)" >> "$ENV_FILE"
fi

cat > "$SERVICE" <<EOF
[Unit]
Description=Toph self-hosted workbench
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=toph
Group=toph
EnvironmentFile=${ENV_FILE}
ExecStart=/usr/local/bin/toph
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ReadWritePaths=${DATA_DIR} ${WORKSPACES}
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

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
  echo "Toph did not become healthy. Check: journalctl -u toph -n 80 --no-pager" >&2
  exit 1
fi

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo
echo "Toph ${VERSION} is running."
echo "  App:  http://${IP:-SERVER_IP}:${PORT}/app"
echo "  Docs: http://${IP:-SERVER_IP}:${PORT}/docs.html"
echo "  Data: ${DATA_DIR}"
echo "  Workspaces: ${WORKSPACES}"
echo "  Service: systemctl status toph"
if [ -n "$NEW_PASSWORD" ]; then
  echo
  echo "Initial admin password: ${NEW_PASSWORD}"
  echo "Store it now; it will not be printed again."
else
  echo
  echo "Existing configuration preserved at ${ENV_FILE}."
fi
