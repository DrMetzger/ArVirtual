import { Download } from "lucide-react";
import { Field, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { converterVideos } from "./actions";

/** Formulário do conversor: cola os links e (opcional) liga os vídeos a um produto de afiliado. */
export function FormConverter({ produtos, voltar = "/videos" }: { produtos: { id: number; nome: string }[]; voltar?: string }) {
  return (
    <form action={converterVideos} className="grid gap-3 p-4 sm:p-5">
      <input type="hidden" name="voltar" value={voltar} />
      <Field label="Links dos vídeos" hint="Um por linha (até 30). TikTok, Instagram, Reels, YouTube/Shorts, Facebook, Threads, Shopee Vídeo, Kwai, Pinterest, X...">
        <Textarea name="links" rows={3} required placeholder={"https://www.tiktok.com/@.../video/...\nhttps://www.instagram.com/reel/...\nhttps://www.threads.net/@.../post/..."} />
      </Field>
      <div className="flex flex-wrap items-end gap-3">
        {produtos.length ? (
          <Field label="Produto de afiliado (opcional)" className="min-w-0 flex-1 basis-60">
            <Select name="produtoId" defaultValue="">
              <option value="">Nenhum</option>
              {produtos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <SubmitButton variant="gold" pendingText="Enviando...">
          <Download /> Converter e baixar
        </SubmitButton>
      </div>
    </form>
  );
}
