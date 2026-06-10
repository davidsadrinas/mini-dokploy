import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/server/db/schema";
import * as authSchema from "@/server/db/auth-schema";

// Singleton via globalThis: en dev, el HMR de Next recarga este modulo varias
// veces; sin esto abririamos multiples conexiones al mismo archivo SQLite.
const globalForDb = globalThis as unknown as {
  sqlite?: Database.Database;
};

// DATABASE_PATH apunta al volumen persistente en el contenedor; en dev local
// cae en ./data.db.
const dbPath = process.env.DATABASE_PATH ?? "data.db";
const sqlite = globalForDb.sqlite ?? new Database(dbPath);
if (!globalForDb.sqlite) globalForDb.sqlite = sqlite;

// Bootstrap idempotente: creamos la tabla si no existe en cada arranque.
// Decision pragmatica para una herramienta local de un nodo (en prod seria
// drizzle-kit migrate). Tradeoff anotado para el README.
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS deployments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT '',
    repo_url TEXT NOT NULL,
    dockerfile_path TEXT NOT NULL,
    port INTEGER NOT NULL,
    subdomain TEXT NOT NULL,
    custom_labels TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'queued',
    logs TEXT NOT NULL DEFAULT '',
    service_name TEXT,
    image_tag TEXT,
    error TEXT,
    created_at INTEGER NOT NULL
  );
`);

// Bootstrap de las tablas de Better Auth (mismo criterio idempotente que arriba).
// camelCase en las columnas para casar con el auth-schema y con el adapter.
// Fechas y booleanos como INTEGER (epoch / 0|1), igual que el mapeo de Drizzle.
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS user (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    emailVerified INTEGER NOT NULL DEFAULT 0,
    image TEXT,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS session (
    id TEXT PRIMARY KEY,
    expiresAt INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    ipAddress TEXT,
    userAgent TEXT,
    userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS account (
    id TEXT PRIMARY KEY,
    accountId TEXT NOT NULL,
    providerId TEXT NOT NULL,
    userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    accessToken TEXT,
    refreshToken TEXT,
    idToken TEXT,
    accessTokenExpiresAt INTEGER,
    refreshTokenExpiresAt INTEGER,
    scope TEXT,
    password TEXT,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS verification (
    id TEXT PRIMARY KEY,
    identifier TEXT NOT NULL,
    value TEXT NOT NULL,
    expiresAt INTEGER NOT NULL,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL
  );
`);

// Mini-"migracion" idempotente: si una DB vieja ya tenia la tabla deployments
// sin user_id, CREATE TABLE IF NOT EXISTS no la toca, asi que agregamos la
// columna a mano. DEFAULT '' satisface las filas existentes (deployments
// huerfanos, sin dueno). Esto es el tradeoff "bootstrap no migra": en prod, un
// drizzle-kit migrate generaria esto a partir del schema.
const deploymentCols = sqlite
  .prepare("PRAGMA table_info(deployments)")
  .all() as { name: string }[];
if (!deploymentCols.some((c) => c.name === "user_id")) {
  sqlite.exec(
    "ALTER TABLE deployments ADD COLUMN user_id TEXT NOT NULL DEFAULT ''",
  );
}

export const db = drizzle(sqlite, { schema: { ...schema, ...authSchema } });
