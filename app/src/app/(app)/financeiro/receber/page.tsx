import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { ListaTitulos } from "../lista-titulos";

export const metadata: Metadata = { title: "Contas a receber" };

export default async function Page({ searchParams }: { searchParams: Promise<{ f?: string; q?: string }> }) {
  await requireUser();
  const { f, q } = await searchParams;
  return <ListaTitulos tipo="receber" f={f} q={q?.trim()} />;
}
