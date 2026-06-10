import { toNodeHandler } from "better-auth/node";
import { auth } from "@/server/auth";

// Catch-all: TODAS las rutas /api/auth/* (sign-up, sign-in, get-session, sign-out...)
// las maneja Better Auth. toNodeHandler adapta el handler (Web Request/Response) a
// los objetos req/res de Node que usa el API route de Next.
//
// bodyParser: false -> Next NO parsea el body; Better Auth lo lee crudo. Si lo
// dejaramos activo, el body llegaria ya consumido y el handler veria un cuerpo vacio.
export const config = { api: { bodyParser: false } };

export default toNodeHandler(auth);
