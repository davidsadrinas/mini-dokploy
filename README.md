# Mini-Dokploy

A minimal self-hosted PaaS. Give it a **Git repo URL + Dockerfile path + port**, and it
builds the image, runs it as a **Docker Swarm service**, and exposes it through **Traefik**
on a generated `sslip.io` subdomain. A small UI lists, redeploys, and removes deployments,
and streams build logs live.

Built as a take-home for a founding-engineer role at [Dokploy](https://dokploy.com).

---

## Stack

TypeScript · Next.js (Pages Router) · tRPC v11 · SQLite + Drizzle · dockerode · Docker Swarm ·
Traefik v3 · WebSockets · sslip.io

---

## Setup

**Requirements:** Docker Desktop with Swarm available, Node 20+.

### One command — full stack (Traefik + panel, both as Swarm services)

```bash
npm install
npm run up
# Panel: http://dokploy.127.0.0.1.sslip.io
```

`npm run up` is idempotent: it initializes Swarm, creates the shared overlay network, builds the
panel image, and deploys the stack.

> **Port 80 already taken?** Override the Traefik entrypoint:
> ```bash
> HTTP_PORT=8090 npm run up
> # Panel: http://dokploy.127.0.0.1.sslip.io:8090
> # Deployed apps:  http://app-<id>.127.0.0.1.sslip.io:8090
> ```

Tear everything down:

```bash
npm run down
```

### Dev mode (with live WebSocket logs)

```bash
npm run dev    # custom server (Next + ws) at http://localhost:3000
```

`examples/hello/` is a tiny nginx app you can deploy to try it out.

---

## Architecture

```
                 Browser
                    │  (tRPC over HTTP)
                    ▼
   ┌──────────────────────────────────┐
   │  Mini-Dokploy panel (Swarm svc)   │
   │  Next.js + tRPC + custom ws server│
   │                                   │   SQLite (Drizzle)
   │  list/create/redeploy/remove ─────┼──►  deployments
   │  runDeploy (async state machine)  │
   │    clone → build → service        │
   └───────────────┬──────────────────┘
                   │ dockerode over /var/run/docker.sock
                   ▼
            Docker daemon (host)
              builds image, creates Swarm service with Traefik labels
                   │
                   ▼
   ┌──────────────────────────────────┐
   │  Traefik (Swarm svc, port :80)    │  reads Host header + service labels
   └───────────────┬──────────────────┘
                   ▼
            app-<id>.127.0.0.1.sslip.io   (sslip.io resolves *.127.0.0.1 → 127.0.0.1)
```

**Three roles in routing:** `sslip.io` = name→IP (pure DNS, no setup) · `Traefik` = Host→service
(reverse proxy, rules from service labels) · `Swarm` = keep N replicas healthy and load-balance
them (routing mesh).

**Deploy flow** is an async state machine (`queued → building → running | error`). `create`
returns immediately and the UI polls; `runDeploy` clones the repo (simple-git), tars the build
context (tar-fs), builds and creates the service via dockerode. Each build line is persisted to
the DB **and** pushed to an in-process event bus, which a WebSocket streams to the UI live.

**Why Docker Swarm** (not `docker run` / not plain compose): the brief asks for "Docker services."
A `docker run` container that dies stays dead; a Swarm *service* is declarative — the manager
reconciles to the desired state (self-healing, rolling updates, load balancing). It's also what
real Dokploy uses, and it shares Kubernetes' declarative model with a simpler operational surface.

---

## Tradeoffs and what I'd build next

| Decision | Tradeoff | What I'd do in production |
|---|---|---|
| **SQLite + idempotent bootstrap** (`CREATE TABLE IF NOT EXISTS`) | No schema evolution: adding a column to a populated table isn't applied | Postgres + `drizzle-kit migrate` (versioned, reversible) |
| **`docker.sock` mounted in the panel** | Socket = root on host; panel runs on a manager = control of the whole cluster | A socket-proxy that allows only the service API; rootless Docker |
| **Redeploy = remove + recreate** | Brief downtime; leaves dangling `:latest` images | `docker service update --image` with versioned tags → rolling updates + rollback |
| **Deploy runs in the panel's own Node process** | A heavy build competes with the web process; doesn't scale horizontally | A separate build worker + a real queue (BullMQ/Redis) |

**Other next steps:** auth + multi-tenancy (users own their deployments), custom domains +
automatic TLS (Traefik + Let's Encrypt), per-deployment env vars and secrets, an image registry
instead of host-local `:latest`, and resource limits per service.
