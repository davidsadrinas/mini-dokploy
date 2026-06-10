import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { WebSocketServer } from "ws";
import { logBus } from "./server/logBus";

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
      wss.handleUpgrade(req, socket, head, (ws) => {
        if (!id) {
          ws.close();
          return;
        }
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
    } else {
      // El resto (HMR de Next en dev, etc.) lo maneja Next.
      upgradeHandler(req, socket, head);
    }
  });

  server.listen(port, () => {
    console.log(`> Mini-Dokploy en http://localhost:${port} (dev=${dev})`);
  });
});
