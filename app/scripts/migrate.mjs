// Aplica as migrações do banco e garante o usuário administrador inicial.
// Roda a cada início do container (é idempotente).
import bcrypt from "bcryptjs";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL não definida");

const sql = postgres(url, { max: 1, onnotice: () => {} });
await migrate(drizzle(sql), { migrationsFolder: new URL("../drizzle", import.meta.url).pathname });
console.log("Migrações aplicadas.");

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const senha = process.env.ADMIN_PASSWORD;
const [{ total }] = await sql`select count(*)::int as total from usuarios`;
if (total === 0) {
  if (!email || !senha) throw new Error("Primeiro acesso: defina ADMIN_EMAIL e ADMIN_PASSWORD.");
  if (senha.length < 6) throw new Error("ADMIN_PASSWORD precisa ter ao menos 6 caracteres.");
  await sql`insert into usuarios (nome, email, senha_hash, papel)
            values (${process.env.ADMIN_NAME || "Administrador"}, ${email}, ${await bcrypt.hash(senha, 12)}, 'admin')`;
  console.log(`Administrador criado: ${email}`);
}
await sql`insert into empresa (id) values (1) on conflict do nothing`;
await sql.end();
