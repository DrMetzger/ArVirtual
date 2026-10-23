import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Reaproveita a conexão entre recarregamentos do servidor de desenvolvimento.
const globalForDb = globalThis as unknown as { pg?: ReturnType<typeof postgres> };
// A conexão só abre na primeira consulta, então o build funciona sem DATABASE_URL.
const client = globalForDb.pg ?? postgres(process.env.DATABASE_URL ?? "", { max: 10 });
if (process.env.NODE_ENV !== "production") globalForDb.pg = client;

export const db = drizzle(client, { schema });
export { schema };
