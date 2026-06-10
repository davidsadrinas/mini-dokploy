import { z } from "zod";
import { publicProcedure, router } from "@/server/trpc";
import { deploymentsRouter } from "@/server/routers/deployments";

export const appRouter = router({
  hello: publicProcedure
    .input(z.object({ name: z.string().optional() }))
    .query(({ input }) => {
      return { greeting: `Hola ${input.name ?? "mundo"} desde el server` };
    }),
  deployments: deploymentsRouter,
});

export type AppRouter = typeof appRouter;
