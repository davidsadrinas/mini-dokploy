import os from "os";
import path from "path";
import fs from "fs/promises";
import { randomBytes } from "crypto";
import Docker from "dockerode";
import tar from "tar-fs";
import { simpleGit } from "simple-git";

// Singleton del cliente Docker. Por defecto se conecta al socket del daemon
// (/var/run/docker.sock): ese socket ES la API de Docker. Hablarle por ahi es
// lo que nos deja crear contenedores/services desde nuestro propio proceso.
const globalForDocker = globalThis as unknown as { docker?: Docker };
export const docker = globalForDocker.docker ?? new Docker();
if (!globalForDocker.docker) globalForDocker.docker = docker;

// Red overlay compartida entre Traefik y las apps desplegadas. Traefik solo
// puede rutear hacia services que esten en esta red.
export const NETWORK_NAME = "mini-dokploy-net";

// (1) Clonar el repo a un directorio temporal. --depth 1 = solo el ultimo commit.
export async function cloneRepo(repoUrl: string): Promise<string> {
  const dir = path.join(os.tmpdir(), `mini-dokploy-${randomBytes(4).toString("hex")}`);
  await simpleGit().clone(repoUrl, dir, ["--depth", "1"]);
  return dir;
}

// (2) Buildear la imagen. Docker no recibe un directorio: recibe un .tar con el
// "build context". tar-fs empaqueta el repo; followProgress nos da el log linea
// a linea (lo mismo que verias en una terminal con `docker build`).
export async function buildImage(
  contextDir: string,
  dockerfilePath: string,
  imageTag: string,
  onLog: (line: string) => void
): Promise<void> {
  const tarStream = tar.pack(contextDir, {
    ignore: (name) => name.includes(`${path.sep}.git${path.sep}`),
  });

  const buildStream = await docker.buildImage(tarStream, {
    t: imageTag,
    dockerfile: dockerfilePath,
  });

  await new Promise<void>((resolve, reject) => {
    docker.modem.followProgress(
      buildStream,
      (err, res) => {
        if (err) return reject(err);
        const failed = res?.find((e) => e.error);
        if (failed) return reject(new Error(failed.error));
        resolve();
      },
      (event) => {
        const line = event.stream ?? event.status ?? event.error;
        if (line) onLog(String(line).trimEnd());
      }
    );
  });
}

// Genera los labels de Traefik para una app y los mergea con los custom.
// GOTCHA: estos labels van a nivel SERVICE (no de contenedor); el provider
// swarm de Traefik solo lee los labels del service.
export function buildTraefikLabels(opts: {
  serviceName: string;
  subdomain: string;
  port: number;
  customLabels: Record<string, string>;
}): Record<string, string> {
  const generated: Record<string, string> = {
    "traefik.enable": "true",
    [`traefik.http.routers.${opts.serviceName}.rule`]: `Host(\`${opts.subdomain}\`)`,
    [`traefik.http.routers.${opts.serviceName}.entrypoints`]: "web",
    [`traefik.http.services.${opts.serviceName}.loadbalancer.server.port`]: String(opts.port),
    "traefik.swarm.network": NETWORK_NAME,
  };
  // Mergeamos custom primero y generados despues: los generados ganan, para que
  // un label custom no pueda romper el ruteo. (Decision; se discute en M7.)
  return { ...opts.customLabels, ...generated };
}

// (3) Crear el Swarm service. A diferencia de `docker run`, esto declara un
// estado deseado (1 replica) que el orquestador mantiene. Lo conectamos a la
// red overlay y le ponemos los labels de Traefik a nivel service.
export async function createService(opts: {
  serviceName: string;
  imageTag: string;
  subdomain: string;
  port: number;
  customLabels: Record<string, string>;
}): Promise<string> {
  const labels = buildTraefikLabels({
    serviceName: opts.serviceName,
    subdomain: opts.subdomain,
    port: opts.port,
    customLabels: opts.customLabels,
  });

  const service = await docker.createService({
    Name: opts.serviceName,
    Labels: labels,
    TaskTemplate: {
      ContainerSpec: { Image: opts.imageTag },
      Networks: [{ Target: NETWORK_NAME }],
    },
    Mode: { Replicated: { Replicas: 1 } },
  });
  return service.id;
}

// Borra un service. Idempotente: si no existe (404), no es error.
export async function removeService(serviceName: string): Promise<void> {
  try {
    await docker.getService(serviceName).remove();
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode !== 404) throw err;
  }
}

export async function cleanupDir(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}
