import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { WebSocketServer } from "ws";
import { and, eq } from "drizzle-orm";
import { fromNodeHeaders } from "better-auth/node";
import { logBus } from "./server/logBus";
import { auth } from "./server/auth";
import { db } from "./server/db";
import { deployments } from "./server/db/schema";

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT ?? "3000", 10);

const app = next({ dev });

app.prepare().then(() => {
  const handle = app.getRequestHandler();
  const upgradeHandler = app.getUpgradeHandler();

  const server = createServer((req, res) => {
    handle(req, res, parse(req.url ?? "/", true));
  });

  // noServer: nosotros decidimos que upgrades agarra el ws y cuales van a Next.
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const { pathname, query } = parse(req.url ?? "/", true);

    if (pathname === "/api/logs") {
      const id = typeof query.id === "string" ? query.id : "";

      // Mismo guard que los procedures de tRPC, pero en el upgrade: el WS llega
      // con las cookies del browser, asi que resolvemos la sesion y verificamos
      // ownership ANTES de aceptar la conexion. Sin esto, cualquiera con un id
      // podria streamear los logs de otro tenant.
      void (async () => {
        const session = await auth.api.getSession({
          headers: fromNodeHeaders(req.headers),
        });
        if (!session) {
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
          socket.destroy();
          return;
        }
        const dep = id
          ? db
              .select({ id: deployments.id })
              .from(deployments)
              .where(
                and(
                  eq(deployments.id, id),
                  eq(deployments.userId, session.user.id),
                ),
              )
              .get()
          : undefined;
        // 404 tanto para "no existe" como para "no es tuyo": mismo criterio
        // anti-enumeracion que NOT_FOUND en el router.
        if (!dep) {
          socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
          socket.destroy();
          return;
        }

        wss.handleUpgrade(req, socket, head, (ws) => {
          const onLine = (line: string) => {
            if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: "log", line }));
          };
          const onDone = (status: string) => {
            if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: "done", status }));
          };
          logBus.on(`log:${id}`, onLine);
          logBus.on(`done:${id}`, onDone);
          ws.on("close", () => {
            logBus.off(`log:${id}`, onLine);
            logBus.off(`done:${id}`, onDone);
          });
        });
      })().catch(() => socket.destroy());
    } else {
      // El resto (HMR de Next en dev, etc.) lo maneja Next.
      upgradeHandler(req, socket, head);
    }
  });

  server.listen(port, () => {
    console.log(`> Mini-Dokploy en http://localhost:${port} (dev=${dev})`);
  });
});
