import { randomBytes } from "crypto";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { publicProcedure, router } from "@/server/trpc";
import { db } from "@/server/db";
import { deployments, type NewDeployment } from "@/server/db/schema";
import { runDeploy } from "@/server/deploy";
import { removeService } from "@/server/docker";

// Id corto (8 hex) que tambien usamos para el subdominio: app-<id>.127.0.0.1.sslip.io
function generateId() {
  return randomBytes(4).toString("hex");
}

// Acepta URLs http(s)/git/ssh/file y la forma scp de git (git@host:user/repo.git).
function isValidRepoUrl(value: string): boolean {
  if (/^[\w.-]+@[\w.-]+:.+/.test(value)) return true;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

// Dispara el deploy en segundo plano. No await: la request vuelve al toque y la
// UI poolea el estado. El error ya se persiste dentro de runDeploy, asi que aca
// solo evitamos un unhandled rejection.
function startDeployInBackground(id: string) {
  void runDeploy(id).catch((err) => {
    console.error(`runDeploy(${id}) fallo:`, err);
  });
}

const createInput = z.object({
  // trim: una URL pegada suele arrastrar espacios; los limpiamos antes de validar
  // y antes de pasarsela a git (un espacio final rompe el clone).
  repoUrl: z.string().trim().min(1).refine(isValidRepoUrl, "URL de repo invalida"),
  dockerfilePath: z.string().trim().min(1).default("Dockerfile"),
  port: z.number().int().min(1).max(65535),
  customLabels: z.record(z.string(), z.string()).optional(),
});

export const deploymentsRouter = router({
  list: publicProcedure.query(() => {
    return db
      .select()
      .from(deployments)
      .orderBy(desc(deployments.createdAt))
      .all();
  }),

  create: publicProcedure.input(createInput).mutation(({ input }) => {
    const id = generateId();
    const subdomain = `app-${id}.127.0.0.1.sslip.io`;

    const row: NewDeployment = {
      id,
      repoUrl: input.repoUrl,
      dockerfilePath: input.dockerfilePath,
      port: input.port,
      subdomain,
      customLabels: input.customLabels ?? {},
      status: "queued",
    };

    db.insert(deployments).values(row).run();

    // Deploy asincrono: arranca en background y la UI poolea.
    startDeployInBackground(id);

    return db.select().from(deployments).where(eq(deployments.id, id)).get();
  }),

  redeploy: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => {
      // Reset visible inmediato, luego runDeploy (idempotente) en background.
      db.update(deployments)
        .set({ status: "queued", error: null })
        .where(eq(deployments.id, input.id))
        .run();

      startDeployInBackground(input.id);

      return db.select().from(deployments).where(eq(deployments.id, input.id)).get();
    }),

  remove: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const dep = db
        .select()
        .from(deployments)
        .where(eq(deployments.id, input.id))
        .get();

      if (dep?.serviceName) {
        await removeService(dep.serviceName);
      }
      db.delete(deployments).where(eq(deployments.id, input.id)).run();
      return { ok: true };
    }),
});
