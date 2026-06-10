import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { auth } from "@/server/auth";

// La sesion que Better Auth resuelve desde las cookies/headers del request, o
// null si no hay sesion valida. La derivamos del tipo de getSession para no
// duplicarla a mano.
export type AuthSession = Awaited<ReturnType<typeof auth.api.getSession>>;

export type Context = {
  session: AuthSession;
};

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

// Authz: corta con UNAUTHORIZED si no hay sesion. Despues del guard, re-pasamos
// el ctx con session "estrechada" a no-null, asi los procedures protegidos
// acceden a ctx.session.user.id sin chequeos extra y con types correctos.
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { session: ctx.session } });
});
