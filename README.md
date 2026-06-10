# Mini-Dokploy

A minimal self-hosted PaaS. Give it a **Git repo URL + Dockerfile path + port**, and it
builds the image, runs it as a **Docker Swarm service**, and exposes it through **Traefik**
on a generated `sslip.io` subdomain. A small UI lists, redeploys, and removes deployments,
streams build logs live, and isolates each user's deployments behind login.

Built as a take-home for a founding-engineer role at [Dokploy](https://dokploy.com).

---

## Stack

TypeScript · Next.js (Pages Router) · tRPC v11 · SQLite + Drizzle · dockerode · Docker Swarm ·
Traefik v3 · Better Auth · WebSockets · sslip.io

---

## Setup

**Requirements:** Docker Desktop with Swarm available (`docker swarm init` is run for you),
Node 20+, `openssl` (for the auth secret).

### One command — full stack (Traefik + panel, both as Swarm services)

```bash
npm install
npm run up
# Panel: http://dokploy.127.0.0.1.sslip.io
```

`npm run up` is idempotent: it initializes Swarm, creates the shared overlay network, generates
a session secret (once, gitignored), builds the panel image, and deploys the stack.

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

### Trying a deployment

`examples/hello/` is a tiny nginx app you can deploy. In the UI, create an account, then submit
any reachable Git repo URL + its Dockerfile path + the port the container listens on.

---

## Architecture

```
                 Browser
                    │  (tRPC over HTTP, session cookie)
                    ▼
   ┌──────────────────────────────────┐
   │  Mini-Dokploy panel (Swarm svc)   │
   │  Next.js + tRPC + custom ws server│
   │                                   │
   │  Better Auth ── session ──┐       │
   │                           ▼       │
   │  protectedProcedure → ownership   │   SQLite (Drizzle)
   │  list/create/redeploy/remove ─────┼──►  deployments (userId)
   │                                   │     user/session/account
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

**Auth / multi-tenancy.** Better Auth resolves the session in the tRPC context on every request
(authn). `protectedProcedure` gates on a valid session; every query is scoped by `userId`
(ownership). Cross-tenant access returns `NOT_FOUND`, never `FORBIDDEN`, so an attacker can't
enumerate which deployments exist. This is the bonus that maps directly to a real PaaS failure
mode: one team seeing another team's preview deployments (and their env/secrets).

**Why Docker Swarm** (not `docker run` / not plain compose): the brief asks for "Docker services."
A `docker run` container that dies stays dead; a Swarm *service* is declarative — the manager
reconciles to the desired state (self-healing, rolling updates, load balancing). It's also what
real Dokploy uses, and it shares Kubernetes' declarative model with simpler operational surface.

---

## Tradeoffs and what I'd build next

| Decision | Tradeoff | What I'd do in production |
|---|---|---|
| **SQLite + idempotent bootstrap** (`CREATE TABLE IF NOT EXISTS`) | No schema evolution: adding a column to a populated table isn't applied | Postgres + `drizzle-kit migrate` (versioned, reversible) — the deployment state is users' source of truth |
| **`docker.sock` mounted in the panel** | Socket = root on host; panel runs on a manager = control of the whole cluster. Compromise the panel → compromise the swarm | A socket-proxy that allows only the service API; rootless Docker; isolate the control plane |
| **Redeploy = remove + recreate** | Brief downtime; leaves dangling `:latest` images | `docker service update --image` with versioned tags → rolling updates + rollback |
| **Deploy runs in the panel's own Node process** | A heavy build competes with the web process; doesn't scale horizontally | A separate build worker + a real queue (BullMQ/Redis), so the API and builds scale independently |
| **Session secret auto-generated locally** | Fine for a single local node | A managed secret (Swarm/Vault secret), rotation, real `BETTER_AUTH_URL` per environment |
| **Auth is ownership-only** (no roles) | Can't model teams/permissions yet | RBAC (admin/dev/viewer) + organizations, which is what a multi-team PaaS needs next |

**Other next steps:** custom domains + automatic TLS (Traefik + Let's Encrypt), per-deployment
env vars and secrets, image registry instead of host-local `:latest`, healthchecks surfaced in the
UI, and resource limits per service.

---

## How I used AI tools (and where I didn't)

I worked with an AI assistant in two phases. First, I shaped an **interactive plan** together —
splitting the project into milestones (orchestration, persistence, Docker integration, routing,
one-command stack, live logs, auth) and agreeing on the approach and tradeoffs before writing any
code. Then I worked through that plan **point by point**: at each step I wrote and reviewed the
code and asked *why* until I understood it, only moving on once I could explain that piece in my
own words — repeating that loop until I reached the final result. If I couldn't defend a line, it
didn't ship.

**Where AI helped:**
- Explaining the *why* behind concepts I was learning (Swarm reconciliation, Traefik's
  service-level labels gotcha, why `globalThis` is needed for the in-process log bus, authn vs
  authz, why `NOT_FOUND` beats `FORBIDDEN`).
- Boilerplate wiring I understand but didn't want to retype (tRPC client/server setup).
- Reviewing my code and catching edge cases (e.g. trimming the repo URL so a pasted trailing
  space doesn't break `git clone`).

**Where I didn't:**
- I didn't let it scaffold the whole app upfront. Every file was added deliberately, milestone by
  milestone, so the structure stays explainable.
- The architecture decisions (Swarm over K8s, idempotent bootstrap, async deploy, ownership-based
  multi-tenancy) are mine — I can defend each tradeoff and what I'd change for production.
- I verified behavior by hand (two accounts not seeing each other's deployments, a failing build
  landing in `error` with the message visible), not by trusting generated code.
