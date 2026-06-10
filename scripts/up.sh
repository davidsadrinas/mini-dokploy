#!/usr/bin/env bash
set -euo pipefail

HTTP_PORT="${HTTP_PORT:-80}"
export HTTP_PORT

# Better Auth: el secreto firma las sesiones. Lo generamos una sola vez y lo
# persistimos en un archivo gitignored, asi NO vive en el repo y es estable entre
# redeploys (las sesiones sobreviven). La URL es el origin real del panel.
SECRET_FILE=".better-auth-secret"
if [ ! -f "$SECRET_FILE" ]; then
  echo "==> Generando BETTER_AUTH_SECRET (una sola vez)..."
  openssl rand -hex 32 > "$SECRET_FILE"
fi
BETTER_AUTH_SECRET="$(cat "$SECRET_FILE")"
export BETTER_AUTH_SECRET
BETTER_AUTH_URL="http://dokploy.127.0.0.1.sslip.io:${HTTP_PORT}"
export BETTER_AUTH_URL

# 1. Swarm init (idempotente).
if ! docker info --format '{{.Swarm.LocalNodeState}}' | grep -q active; then
  echo "==> Inicializando Swarm..."
  docker swarm init
fi

# 2. Red overlay compartida (idempotente). external en el stack.
if ! docker network inspect mini-dokploy-net >/dev/null 2>&1; then
  echo "==> Creando red overlay mini-dokploy-net..."
  docker network create --driver overlay --attachable mini-dokploy-net
fi

# 3. Build de la imagen del panel.
echo "==> Buildeando imagen mini-dokploy:latest..."
docker build -t mini-dokploy:latest .

# 4. Deploy del stack (Traefik + panel).
echo "==> Desplegando stack..."
docker stack deploy -c stack.yml mini-dokploy

echo ""
echo "Listo. Panel en: http://dokploy.127.0.0.1.sslip.io:${HTTP_PORT}"
