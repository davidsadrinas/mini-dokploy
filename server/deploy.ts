import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { deployments } from "@/server/db/schema";
import { cloneRepo, buildImage, createService, removeService, cleanupDir } from "@/server/docker";
import { emitLog, emitDone } from "@/server/logBus";

// Orquesta el deploy de una fila ya existente en la DB.
// Maquina de estados: queued -> building -> running | error.
export async function runDeploy(id: string): Promise<void> {
  const dep = db.select().from(deployments).where(eq(deployments.id, id)).get();
  if (!dep) throw new Error(`Deployment ${id} no existe`);

  const imageTag = `mini-dokploy/${id}:latest`;
  const serviceName = `app-${id}`;

  const logLines: string[] = [];
  const appendLog = (line: string) => {
    logLines.push(line);
    db.update(deployments)
      .set({ logs: logLines.join("\n") })
      .where(eq(deployments.id, id))
      .run();
    // Emitimos al bus para los WebSockets suscritos (logs en vivo).
    emitLog(id, line);
  };

  db.update(deployments).set({ status: "building" }).where(eq(deployments.id, id)).run();

  let repoDir: string | undefined;
  try {
    appendLog(`Clonando ${dep.repoUrl} ...`);
    repoDir = await cloneRepo(dep.repoUrl);

    appendLog(`Buildeando imagen ${imageTag} (Dockerfile: ${dep.dockerfilePath}) ...`);
    await buildImage(repoDir, dep.dockerfilePath, imageTag, appendLog);

    // Idempotente: si es un redeploy, borramos el service viejo antes de crear.
    appendLog(`Creando service ${serviceName} ...`);
    await removeService(serviceName);
    await createService({
      serviceName,
      imageTag,
      subdomain: dep.subdomain,
      port: dep.port,
      customLabels: dep.customLabels,
    });

    db.update(deployments)
      .set({ status: "running", serviceName, imageTag, error: null })
      .where(eq(deployments.id, id))
      .run();
    appendLog("Deploy OK.");
    emitDone(id, "running");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    appendLog(`ERROR: ${message}`);
    db.update(deployments)
      .set({ status: "error", error: message })
      .where(eq(deployments.id, id))
      .run();
    emitDone(id, "error");
    throw err;
  } finally {
    if (repoDir) await cleanupDir(repoDir);
  }
}
