#!/usr/bin/env bash
set -euo pipefail

HTTP_PORT="${HTTP_PORT:-80}"
export HTTP_PORT

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
