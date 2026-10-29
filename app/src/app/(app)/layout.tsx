import { cookies, headers } from "next/headers";
import { Sidebar } from "@/components/sidebar";
import { RegistrarAparelho } from "@/components/registrar-aparelho";
import { TabelasResponsivas } from "@/components/tabelas-responsivas";
import { dentroDoApp, infoApp } from "@/lib/app-android";
import { requireUser } from "@/lib/auth";
import { COOKIE_MENU } from "@/lib/menu";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const iniciais = user.nome
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const recolhido = (await cookies()).get(COOKIE_MENU)?.value === "recolhido";
  // Atalho para baixar o app Android (some dentro do próprio app).
  const app = dentroDoApp((await headers()).get("user-agent")) ? null : await infoApp();

  return (
    <div className="min-h-dvh">
      <TabelasResponsivas />
      <RegistrarAparelho />
      <Sidebar usuario={{ nome: user.nome, papel: user.papel, iniciais }} recolhidoInicial={recolhido} appAndroid={app?.versao}>
        {children}
      </Sidebar>
    </div>
  );
}
