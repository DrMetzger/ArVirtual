import Image from "next/image";
import { db } from "@/db";
import { formatDocumento } from "@/lib/utils";

// Renderizadas a cada acesso (leem os dados da empresa; o build não tem banco).
export const dynamic = "force-dynamic";

// Páginas públicas (sem login): termos de uso e política de privacidade, exigidos pelos marketplaces
// na tela de consentimento do OAuth.
export default async function PublicoLayout({ children }: { children: React.ReactNode }) {
  const emp = await db.query.empresa.findFirst({ columns: { razaoSocial: true, cnpj: true, email: true } });
  return (
    <div className="min-h-dvh bg-background">
      <header className="bg-sidebar px-6 py-5">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <Image src="/logo-mark-dark.png" alt="" width={48} height={28} />
          <div className="leading-none">
            <p className="font-display text-base font-extrabold tracking-wide text-white">ARVIRTUAL</p>
            <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.2em] text-[#e6c158]">Pesquisa &amp; Desenvolvimento</p>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-10 text-sm leading-relaxed [&_h1]:font-display [&_h1]:text-3xl [&_h1]:font-extrabold [&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_p]:mt-3 [&_p]:text-muted [&_li]:text-muted">
        {children}
      </main>
      <footer className="border-t border-border px-6 py-6 text-center text-xs text-muted">
        {emp?.razaoSocial || "ArVirtual Pesquisa & Desenvolvimento"}
        {emp?.cnpj ? ` · CNPJ ${formatDocumento(emp.cnpj)}` : ""} · {emp?.email || "kleber@arvirtual.com.br"}
      </footer>
    </div>
  );
}
