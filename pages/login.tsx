import { useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { signIn, signUp } from "@/utils/auth-client";

// Pantalla de auth: alterna entre "Iniciar sesion" y "Crear cuenta" sobre el
// mismo form. Llama a Better Auth en el browser (signIn/signUp.email) y, si sale
// bien, redirige al panel. La seguridad real vive en el server; esto es la puerta
// de entrada de UX.
export default function Login() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result =
      mode === "signup"
        ? await signUp.email({ name, email, password })
        : await signIn.email({ email, password });

    setLoading(false);
    if (result.error) {
      setError(result.error.message ?? "Algo salio mal");
      return;
    }
    router.push("/");
  }

  return (
    <>
      <Head>
        <title>Mini-Dokploy · {mode === "signup" ? "Crear cuenta" : "Iniciar sesion"}</title>
      </Head>
      <main style={{ fontFamily: "system-ui", padding: "2rem", maxWidth: 360, margin: "4rem auto" }}>
        <h1>Mini-Dokploy</h1>
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: "0.75rem" }}>
          {mode === "signup" && (
            <label style={{ display: "grid", gap: 4 }}>
              <span>Nombre</span>
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
          )}

          <label style={{ display: "grid", gap: 4 }}>
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>

          <label style={{ display: "grid", gap: 4 }}>
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </label>

          <button type="submit" disabled={loading}>
            {loading ? "..." : mode === "signup" ? "Crear cuenta" : "Iniciar sesion"}
          </button>
          {error && <p style={{ color: "crimson" }}>{error}</p>}
        </form>

        <p style={{ marginTop: "1rem", fontSize: 13 }}>
          {mode === "signup" ? "Ya tenes cuenta?" : "No tenes cuenta?"}{" "}
          <button
            type="button"
            onClick={() => {
              setMode(mode === "signup" ? "signin" : "signup");
              setError(null);
            }}
            style={{ background: "none", border: "none", color: "#0969da", cursor: "pointer", padding: 0 }}
          >
            {mode === "signup" ? "Inicia sesion" : "Crea una"}
          </button>
        </p>
      </main>
    </>
  );
}
