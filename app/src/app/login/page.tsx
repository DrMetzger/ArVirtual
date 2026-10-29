import type { Metadata } from "next";
import Image from "next/image";
import { Alert } from "@/components/ui";
import { ThemeToggle } from "@/components/ui/client";
import { headers } from "next/headers";
import { BaixarApp } from "@/components/baixar-app";
import { dentroDoApp, infoApp } from "@/lib/app-android";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ de?: string; expirou?: string }> }) {
  const { de, expirou } = await searchParams;
  const app = dentroDoApp((await headers()).get("user-agent")) ? null : await infoApp();
  return (
    <main className="relative grid min-h-dvh lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-sidebar p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="bg-grid absolute inset-0 opacity-[0.07]" aria-hidden />
        <div
          className="absolute -right-32 -top-32 size-[28rem] rounded-full bg-[#d4af37]/20 blur-3xl"
          aria-hidden
        />
        <div className="absolute -bottom-40 -left-20 size-[26rem] rounded-full bg-[#1a5f9e]/40 blur-3xl" aria-hidden />
        <div className="relative flex items-center gap-3">
          <Image src="/logo-mark-dark.png" alt="" width={64} height={38} priority />
          <div className="leading-tight">
            <p className="font-display text-xl font-extrabold tracking-wide">ARVIRTUAL</p>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#e6c158]">Pesquisa &amp; Desenvolvimento</p>
          </div>
        </div>
        <div className="relative max-w-md">
          <h1 className="font-display text-4xl font-extrabold leading-tight">
            Do <span className="text-[#e6c158]">filamento</span> à <span className="text-[#e6c158]">nota fiscal</span>.
          </h1>
          <p className="mt-4 text-[#c9d6e8]">
            Catálogo, clientes, matriz fiscal, NF-e e anúncios em Mercado Livre, Shopee e Magalu num só lugar, com IA para ajudar no
            dia a dia.
          </p>
          <div className="mt-8 flex gap-2">
            {["#ffe600", "#ee4d2d", "#0086ff"].map((c) => (
              <span key={c} className="h-1.5 w-10 rounded-full" style={{ background: c }} />
            ))}
            <span className="h-1.5 w-10 rounded-full bg-[#ef4b51]" />
          </div>
        </div>
        <p className="relative text-xs text-[#9fb0c8]">São José do Rio Preto · SP</p>
      </section>

      <section className="flex items-center justify-center p-6">
        <ThemeToggle className="absolute right-4 top-4" />
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <Image src="/logo-mark.png" alt="" width={56} height={33} priority className="dark:hidden" />
            <Image src="/logo-mark-dark.png" alt="" width={56} height={33} priority className="hidden dark:block" />
            <p className="font-display text-lg font-extrabold">ARVIRTUAL</p>
          </div>
          <h2 className="text-2xl font-extrabold">Entrar</h2>
          <p className="mb-6 mt-1 text-sm text-muted">Use o e-mail e a senha cadastrados.</p>
          {expirou ? (
            <div className="mb-4">
              <Alert tone="gold">A verificação expirou. Entre de novo para receber outro código.</Alert>
            </div>
          ) : null}
          <LoginForm redirectTo={de && de.startsWith("/") && !de.startsWith("//") ? de : "/"} />
          {app ? <BaixarApp info={app} className="mt-8" /> : null}
        </div>
      </section>
    </main>
  );
}
