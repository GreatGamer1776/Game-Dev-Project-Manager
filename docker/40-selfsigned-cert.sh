#!/bin/sh
# Runs before nginx starts (docker-entrypoint.d hook). Generates a
# self-signed TLS cert when none exists, so HTTPS works out of the box.
# Mount real certs at /etc/nginx/certs (server.crt / server.key) to override.
set -e
CERT_DIR=/etc/nginx/certs
if [ ! -s "$CERT_DIR/server.crt" ] || [ ! -s "$CERT_DIR/server.key" ]; then
  mkdir -p "$CERT_DIR"
  openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
    -subj "/CN=devarchitect" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" \
    -keyout "$CERT_DIR/server.key" -out "$CERT_DIR/server.crt"
  echo "[selfsigned] generated self-signed TLS certificate in $CERT_DIR"
fi
