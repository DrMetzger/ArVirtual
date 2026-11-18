"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { confirmarCodigoBambu, entrarBambu, sairBambu } from "@/lib/bambu-conta";

type Estado = { ok?: string; erro?: string; codigo?: boolean; email?: string } | null;

export async function loginBambu(_: Estado, form: FormData): Promise<Estado> {
  await requireAdmin();
  const email = String(form.get("email") ?? "").trim();
  try {
    if (form.get("codigo")) {
      await confirmarCodigoBambu(email, String(form.get("codigo")));
      revalidatePath("/configuracoes");
      return { ok: "Conta Bambu Lab conectada. Os 3MF do MakerWorld passam a vir junto no cadastro." };
    }
    const r = await entrarBambu(email, String(form.get("senha") ?? ""));
    revalidatePath("/configuracoes");
    return r === "ok" ? { ok: "Conta Bambu Lab conectada." } : { codigo: true, email, ok: "A Bambu mandou um código para o seu e-mail: digite abaixo." };
  } catch (e) {
    return { erro: (e as Error).message, email };
  }
}

export async function desconectarBambu() {
  await requireAdmin();
  await sairBambu();
  revalidatePath("/configuracoes");
}
