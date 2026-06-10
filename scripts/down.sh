#!/usr/bin/env bash
set -euo pipefail

# Baja el stack (Traefik + panel).
echo "==> Removiendo stack mini-dokploy..."
docker stack rm mini-dokploy || true

# Remueve tambien los services de deployments de usuario (app-*), que no son
# parte del stack sino que los crea el panel en runtime.
APPS=$(docker service ls --filter "name=app-" --format '{{.Name}}' || true)
if [ -n "${APPS}" ]; then
  echo "==> Removiendo deployments de usuario..."
  echo "${APPS}" | xargs -r docker service rm
fi

echo "Listo."
