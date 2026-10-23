import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import Image from "next/image";
import { redirect } from "next/navigation";
import { ThemeToggle } from "@/components/ui/client";
import { db } from "@/db";
import { usuarios } from "@/db/schema";
import { PENDING_2FA_COOKIE, verifyPending } from "@/lib/session";
import { VerificarForm } from "./verificar-form";

export const metadata: Metadata = { title: "Verificação em duas etapas" };

/** e-mail parcialmente escondido: ke****@arvirtual.com.br */
function mascarar(email: string) {
  const [nome = "", dominio = ""] = email.split("@");
  return `${nome.slice(0, 2)}${"*".repeat(Math.max(2, nome.length - 2))}@${dominio}`;
}

export default async function VerificarPage() {
  const pendente = await verifyPending((await cookies()).get(PENDING_2FA_COOKIE)?.value);
  if (!pendente) redirect("/login?expirou=1");
  const user = await db.query.usuarios.findFirst({ where: eq(usuarios.id, pendente.sub), columns: { email: true } });
  if (!user) redirect("/login");

  return (
    <main className="relative grid min-h-dvh place-items-center bg-background p-6">
      <div className="bg-grid absolute inset-0 opacity-30" aria-hidden />
      <ThemeToggle className="absolute right-4 top-4" />
      <div className="relative w-full max-w-sm rounded-2xl border border-border bg-surface p-8 shadow-card">
        <div className="mb-6 flex items-center gap-3">
          <Image src="/logo-mark.png" alt="" width={56} height={33} priority className="dark:hidden" />
          <Image src="/logo-mark-dark.png" alt="" width={56} height={33} priority className="hidden dark:block" />
          <p className="font-display text-lg font-extrabold">ARVIRTUAL</p>
        </div>
        <h1 className="text-2xl font-extrabold">Verificação em duas etapas</h1>
        <p className="mb-6 mt-1 text-sm text-muted">
          Enviamos um código de 6 dígitos para <strong className="text-foreground">{mascarar(user.email)}</strong>. Ele vale por 10 minutos.
        </p>
        <VerificarForm />
      </div>
    </main>
  );
}
