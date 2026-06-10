import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { trpc } from "@/utils/trpc";
import { signOut, useSession } from "@/utils/auth-client";
import { LogStream } from "@/components/LogStream";

const STATUS_COLORS: Record<string, string> = {
  queued: "#888",
  building: "#b8860b",
  running: "#1a7f37",
  error: "#cf222e",
};

type LabelRow = { key: string; value: string };

export default function Home() {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  // Gate de UX (NO de seguridad: el server ya corta con UNAUTHORIZED). Si no hay
  // sesion una vez resuelta, mandamos a /login para no mostrar una pantalla rota.
  useEffect(() => {
    if (!isPending && !session) {
      router.replace("/login");
    }
  }, [isPending, session, router]);

  const utils = trpc.useUtils();

  const list = trpc.deployments.list.useQuery(undefined, {
    // Solo consultamos con sesion: sin ella el server respondería UNAUTHORIZED.
    enabled: !!session,
    // Polling: mientras algo este en queued/building, refrescamos cada 1.5s.
    refetchInterval: (query) => {
      const pending = query.state.data?.some(
        (d) => d.status === "queued" || d.status === "building"
      );
      return pending ? 1500 : false;
    },
  });

  const create = trpc.deployments.create.useMutation({
    onSuccess: () => {
      utils.deployments.list.invalidate();
      setRepoUrl("");
      setLabels([]);
    },
  });
  const redeploy = trpc.deployments.redeploy.useMutation({
    onSuccess: () => utils.deployments.list.invalidate(),
  });
  const remove = trpc.deployments.remove.useMutation({
    onSuccess: () => utils.deployments.list.invalidate(),
  });

  const [repoUrl, setRepoUrl] = useState("");
  const [dockerfilePath, setDockerfilePath] = useState("Dockerfile");
  const [port, setPort] = useState("3000");
  const [labels, setLabels] = useState<LabelRow[]>([]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const customLabels: Record<string, string> = {};
    for (const { key, value } of labels) {
      if (key.trim()) customLabels[key.trim()] = value;
    }
    create.mutate({
      repoUrl,
      dockerfilePath,
      port: Number(port),
      customLabels,
    });
  }

  // Mientras Better Auth resuelve la sesion (o si no hay y estamos por redirigir),
  // no renderizamos el panel.
  if (isPending || !session) {
    return (
      <main style={{ fontFamily: "system-ui", padding: "2rem" }}>
        <p>Cargando...</p>
      </main>
    );
  }

  return (
    <>
      <Head>
        <title>Mini-Dokploy</title>
      </Head>
      <main style={{ fontFamily: "system-ui", padding: "2rem", maxWidth: 760, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h1>Mini-Dokploy</h1>
          <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13 }}>
            <span style={{ color: "#666" }}>{session.user.email}</span>
            <button type="button" onClick={() => signOut().then(() => router.replace("/login"))}>
              Logout
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: "0.75rem", marginBottom: "2rem" }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span>Git repo URL</span>
            <input
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/user/repo"
              required
            />
          </label>

          <label style={{ display: "grid", gap: 4 }}>
            <span>Dockerfile path</span>
            <input
              value={dockerfilePath}
              onChange={(e) => setDockerfilePath(e.target.value)}
              placeholder="Dockerfile"
              required
            />
          </label>

          <label style={{ display: "grid", gap: 4 }}>
            <span>Exposed port</span>
            <input type="number" value={port} onChange={(e) => setPort(e.target.value)} required />
          </label>

          <fieldset style={{ border: "1px solid #ddd", borderRadius: 8, padding: "0.75rem" }}>
            <legend style={{ fontSize: 13 }}>Custom labels (opcional)</legend>
            {labels.map((row, i) => (
              <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <input
                  value={row.key}
                  placeholder="key"
                  onChange={(e) => {
                    const next = [...labels];
                    next[i] = { ...next[i], key: e.target.value };
                    setLabels(next);
                  }}
                />
                <input
                  value={row.value}
                  placeholder="value"
                  onChange={(e) => {
                    const next = [...labels];
                    next[i] = { ...next[i], value: e.target.value };
                    setLabels(next);
                  }}
                />
                <button type="button" onClick={() => setLabels(labels.filter((_, j) => j !== i))}>
                  x
                </button>
              </div>
            ))}
            <button type="button" onClick={() => setLabels([...labels, { key: "", value: "" }])}>
              + label
            </button>
          </fieldset>

          <button type="submit" disabled={create.isPending}>
            {create.isPending ? "Creando..." : "Deploy"}
          </button>
          {create.error && <p style={{ color: "crimson" }}>{create.error.message}</p>}
        </form>

        <h2>Deployments</h2>
        {list.isLoading && <p>Cargando...</p>}
        {list.data?.length === 0 && <p>Todavia no hay deployments.</p>}
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: "0.75rem" }}>
          {list.data?.map((d) => (
            <li key={d.id} style={{ border: "1px solid #ddd", borderRadius: 8, padding: "0.75rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                <strong>{d.repoUrl}</strong>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "white",
                    background: STATUS_COLORS[d.status] ?? "#888",
                    borderRadius: 12,
                    padding: "2px 10px",
                  }}
                >
                  {d.status}
                </span>
              </div>
              <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
                <div>Dockerfile: {d.dockerfilePath} · Port: {d.port}</div>
                {d.status === "running" ? (
                  <a href={`http://${d.subdomain}`} target="_blank" rel="noreferrer">
                    http://{d.subdomain}
                  </a>
                ) : (
                  <div>http://{d.subdomain}</div>
                )}
              </div>

              {d.status === "error" && d.error && (
                <p style={{ color: "#cf222e", fontSize: 13, marginTop: 6 }}>Error: {d.error}</p>
              )}

              {(d.logs || d.status === "building" || d.status === "queued") && (
                <details style={{ marginTop: 6 }} open={d.status === "building"}>
                  <summary style={{ fontSize: 13, cursor: "pointer" }}>Logs</summary>
                  <LogStream
                    id={d.id}
                    initialLogs={d.logs}
                    live={d.status === "building" || d.status === "queued"}
                  />
                </details>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button onClick={() => redeploy.mutate({ id: d.id })} disabled={redeploy.isPending}>
                  Redeploy
                </button>
                <button onClick={() => remove.mutate({ id: d.id })} disabled={remove.isPending}>
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
