# Imagen del panel Mini-Dokploy.
# Debian-slim (glibc) para que better-sqlite3 use su binario precompilado.
FROM node:22-slim

# git es necesario en runtime: el panel clona los repos de los usuarios.
RUN apt-get update && apt-get install -y --no-install-recommends git \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Instalamos deps con el lockfile primero (mejor cache). npm ci compila los
# binarios nativos (better-sqlite3) para linux, no para tu macOS.
COPY package.json package-lock.json ./
RUN npm ci

# El resto del codigo (node_modules queda excluido por .dockerignore).
COPY . .

RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
