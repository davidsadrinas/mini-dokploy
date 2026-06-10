import { useEffect, useRef, useState } from "react";

// Muestra los logs de un deployment. Si `live` esta activo (build en curso),
// abre un WebSocket a /api/logs?id=... y va apendeando las lineas en vivo.
export function LogStream({
  id,
  initialLogs,
  live,
}: {
  id: string;
  initialLogs: string;
  live: boolean;
}) {
  const [lines, setLines] = useState<string[]>(
    initialLogs ? initialLogs.split("\n") : []
  );
  const preRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (!live) return;
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${window.location.host}/api/logs?id=${id}`);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === "log") setLines((prev) => [...prev, msg.line]);
    };
    return () => ws.close();
  }, [id, live]);

  // Autoscroll al final cuando llegan lineas nuevas.
  useEffect(() => {
    if (preRef.current) preRef.current.scrollTop = preRef.current.scrollHeight;
  }, [lines]);

  return (
    <pre
      ref={preRef}
      style={{
        background: "#0d1117",
        color: "#c9d1d9",
        padding: "0.75rem",
        borderRadius: 6,
        fontSize: 12,
        maxHeight: 240,
        overflow: "auto",
        whiteSpace: "pre-wrap",
        margin: "6px 0 0",
      }}
    >
      {lines.join("\n")}
    </pre>
  );
}
