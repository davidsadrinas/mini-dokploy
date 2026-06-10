import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { db } from "@/server/db";
import * as authSchema from "@/server/db/auth-schema";

// Config central de Better Auth.
// - database: usamos NUESTRA conexion SQLite (la misma de deployments) via el
//   drizzle-adapter. Le pasamos el auth-schema para que sepa mapear modelo->tabla.
// - emailAndPassword: el unico proveedor que habilitamos (sin OAuth en este take-home).
// - secret: firma cookies/tokens de sesion. En dev cae a un valor fijo (asi las
//   sesiones sobreviven reinicios); en el stack lo inyectamos por env (M9 paso 6).
// - baseURL: de donde se sirve la app, para construir URLs de callback/cookies.
export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "sqlite", schema: authSchema }),
  emailAndPassword: { enabled: true },
  secret:
    process.env.BETTER_AUTH_SECRET ??
    "dev-only-insecure-secret-change-me-in-prod-0123456789",
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
});
