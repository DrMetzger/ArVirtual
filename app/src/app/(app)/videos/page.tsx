import type { Metadata } from "next";
import { Film } from "lucide-react";
import Link from "next/link";
import { buttonClass, Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { listarVideos } from "@/lib/videos-lista";
import { Conversor } from "./conversor";

export const metadata: Metadata = { title: "Conversor de vídeo" };

export default async function VideosPage() {
  await requireUser();
  const videos = await listarVideos();
  return (
    <>
      <PageHeader
        title="Conversor de vídeo"
        description="Cole o link de qualquer vídeo (TikTok, Instagram, YouTube, Facebook, Threads, Shopee...) e baixe em MP4 na maior qualidade para editar e postar."
        actions={
          <Link href="/videos/galeria" className={buttonClass("outline")}>
            <Film /> Galeria de vídeos
          </Link>
        }
      />
      <Card className="p-4 sm:p-5">
        <Conversor iniciais={videos} produtos={[]} />
      </Card>
    </>
  );
}
