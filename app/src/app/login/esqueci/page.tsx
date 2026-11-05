import type { Metadata } from "next";
import Image from "next/image";
import { ThemeToggle } from "@/components/ui/client";
import { EsqueciForm } from "./esqueci-form";

export const metadata: Metadata = { title: "Esqueci minha senha" };

export default function EsqueciPage() {
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
        <h1 className="text-2xl font-extrabold">Esqueci minha senha</h1>
        <p className="mb-6 mt-1 text-sm text-muted">Enviamos um código para o seu e-mail e você cria uma senha nova.</p>
        <EsqueciForm />
      </div>
    </main>
  );
}
