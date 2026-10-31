import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { afiliadosProdutos } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { listarVideos } from "@/lib/videos-lista";
import { Conversor } from "./conversor";

export const metadata: Metadata = { title: "Conversor de vídeo" };

export default async function VideosPage() {
  await requireUser();
  const [videos, produtos] = await Promise.all([
    listarVideos(),
    db.select({ id: afiliadosProdutos.id, nome: afiliadosProdutos.nome }).from(afiliadosProdutos).orderBy(afiliadosProdutos.nome),
  ]);
  return (
    <>
      <PageHeader
        title="Conversor de vídeo"
        description="Cole o link de qualquer vídeo (TikTok, Instagram, YouTube, Facebook, Threads, Shopee...) e baixe em MP4 na maior qualidade para editar e postar."
      />
      <Card className="p-4 sm:p-5">
        <Conversor iniciais={videos} produtos={produtos} />
      </Card>
    </>
  );
}
