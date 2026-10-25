import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { ListaTitulos } from "../lista-titulos";

export const metadata: Metadata = { title: "Contas a pagar" };

export default async function Page({ searchParams }: { searchParams: Promise<{ f?: string; q?: string }> }) {
  await requireUser();
  const { f, q } = await searchParams;
  return <ListaTitulos tipo="pagar" f={f} q={q?.trim()} />;
}
