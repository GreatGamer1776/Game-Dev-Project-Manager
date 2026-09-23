#!/bin/sh
# Runs before nginx starts (docker-entrypoint.d hook).
#
# Modes:
#  - DISABLE_INTERNAL_TLS=true → plain HTTP config (for a TLS-terminating
#    reverse proxy in front). No certs needed.
#  - Otherwise: generate a self-signed cert when none is mounted, so HTTPS
#    works out of the box. Mount real certs at /etc/nginx/certs
#    (server.crt / server.key) to override.
set -e

if [ "${DISABLE_INTERNAL_TLS:-false}" = "true" ]; then
  cp /etc/nginx/http-only.conf /etc/nginx/conf.d/default.conf
  echo "[tls] DISABLE_INTERNAL_TLS set — serving plain HTTP on :80"
  exit 0
fi

CERT_DIR=/etc/nginx/certs
if [ ! -s "$CERT_DIR/server.crt" ] || [ ! -s "$CERT_DIR/server.key" ]; then
  mkdir -p "$CERT_DIR"
  openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
    -subj "/CN=devarchitect" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" \
    -keyout "$CERT_DIR/server.key" -out "$CERT_DIR/server.crt"
  echo "[tls] generated self-signed certificate in $CERT_DIR"
fi
