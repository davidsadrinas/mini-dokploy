import { createNextApiHandler } from "@trpc/server/adapters/next";
import { fromNodeHeaders } from "better-auth/node";
import { appRouter } from "@/server/routers/_app";
import { auth } from "@/server/auth";

export default createNextApiHandler({
  router: appRouter,
  // En cada request resolvemos la sesion a partir de las cookies y la dejamos
  // en el context. fromNodeHeaders adapta los headers de Node al Headers Web
  // que espera Better Auth.
  createContext: async ({ req }) => {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    return { session };
  },
});
