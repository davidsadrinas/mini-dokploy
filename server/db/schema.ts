import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export type DeploymentStatus = "queued" | "building" | "running" | "error";

export const deployments = sqliteTable("deployments", {
  id: text("id").primaryKey(),
  // Dueño del deployment. El scoping multi-tenant cuelga de esta columna:
  // list filtra por aca y redeploy/remove verifican ownership contra ella.
  userId: text("user_id").notNull(),
  repoUrl: text("repo_url").notNull(),
  dockerfilePath: text("dockerfile_path").notNull(),
  port: integer("port").notNull(),
  subdomain: text("subdomain").notNull(),
  customLabels: text("custom_labels", { mode: "json" })
    .$type<Record<string, string>>()
    .notNull()
    .default({}),
  status: text("status").$type<DeploymentStatus>().notNull().default("queued"),
  logs: text("logs").notNull().default(""),
  serviceName: text("service_name"),
  imageTag: text("image_tag"),
  error: text("error"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type Deployment = typeof deployments.$inferSelect;
export type NewDeployment = typeof deployments.$inferInsert;
