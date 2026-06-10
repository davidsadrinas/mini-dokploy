import { EventEmitter } from "events";

// Singleton via globalThis. CLAVE de M8: este modulo se carga por dos caminos
// distintos (Next compila deploy.ts con alias @/..., y el custom server lo
// importa con ruta relativa via tsx). Son dos "instancias" de modulo, pero
// como guardamos el emitter en globalThis, ambas apuntan al MISMO bus dentro
// del mismo proceso. Sin esto, el build emitiria a un emitter y los WebSockets
// escucharian en otro = no llegaria nada.
const globalForBus = globalThis as unknown as { logBus?: EventEmitter };

export const logBus = globalForBus.logBus ?? new EventEmitter();

if (!globalForBus.logBus) {
  // Muchas conexiones WebSocket pueden suscribirse; sacamos el limite default.
  logBus.setMaxListeners(0);
  globalForBus.logBus = logBus;
}

export function emitLog(id: string, line: string): void {
  logBus.emit(`log:${id}`, line);
}

export function emitDone(id: string, status: string): void {
  logBus.emit(`done:${id}`, status);
}
