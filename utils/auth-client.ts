import { createAuthClient } from "better-auth/react";

// Cliente de auth para el browser. Sin baseURL: usa el origin actual, asi
// funciona igual en dev (localhost:3000) y en el stack (dokploy...:8090).
export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession } = authClient;
