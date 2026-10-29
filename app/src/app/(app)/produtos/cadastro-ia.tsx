"use client";

import { ImageOff, Loader2, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui";
import type { SugestaoNcm } from "@/lib/fiscal/ncm";

export type ResultadoIA = { titulo?: string; descricao?: string; ncms?: SugestaoNcm[] };

const CAMPOS = [
  ["titulo", "Título"],
  ["descricao", "Descrição"],
  ["ncm", "NCM"],
] as const;
type Campo = (typeof CAMPOS)[number][0];
const MATERIAIS = ["PLA", "PLA+", "PLA Silk", "PLA Matte", "PETG", "ABS", "ASA", "TPU", "Outro"];

/** Valor de um campo do formulário do produto. */
function valorDoForm(n: string) {
  const form = document.querySelector<HTMLFormElement>("form:has([data-fotos-produto])");
  return String((form && new FormData(form).get(n)) ?? "");
}
const semZero = (v: string) => (v && v !== "0" ? v : "");

/** Fotos do card "Imagens" do formulário (já enviadas ou recém-escolhidas), na ordem da tela. */
const fotosDaTela = () => [...document.querySelectorAll<HTMLImageElement>("[data-fotos-produto] img")].map((i) => i.src).slice(0, 6);

/** Reduz a foto no navegador (lado maior 1024 px, JPEG) para mandar leve para a IA. */
async function reduzir(src: string): Promise<string | null> {
  const img = new Image();
  img.src = src;
  try {
    await img.decode();
  } catch {
    return null;
  }
  const escala = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * escala);
  c.height = Math.round(img.naturalHeight * escala);
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.85);
}

/** Botão "Gerar com IA": analisa as fotos + o que o vendedor conta e preenche título, descrição e NCM. */
export function CadastroIA({ aplicar }: { aplicar: (r: ResultadoIA) => void }) {
  const [aberto, setAberto] = useState(false);
  const [fotos, setFotos] = useState<string[]>([]);
  const [texto, setTexto] = useState("");
  const [campos, setCampos] = useState<Record<Campo, boolean>>({ titulo: true, descricao: true, ncm: true });
  const [medidas, setMedidas] = useState({ altura: "", largura: "", profundidade: "" });
  const [quantidade, setQuantidade] = useState("1");
  const [material, setMaterial] = useState("PLA");
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState("");

  function abrir() {
    setFotos(fotosDaTela());
    setErro("");
    // Já vem preenchido com o que estiver no cadastro; o vendedor ajusta.
    setMedidas((m) => ({
      altura: m.altura || semZero(valorDoForm("alturaCm")),
      largura: m.largura || semZero(valorDoForm("larguraCm")),
      profundidade: m.profundidade || semZero(valorDoForm("comprimentoCm")),
    }));
    const mat = valorDoForm("material");
    if (mat && MATERIAIS.includes(mat)) setMaterial(mat);
    setAberto(true);
  }

  async function gerar() {
    if (texto.trim().length < 3) return setErro("Conte em poucas palavras o que você está vendendo.");
    setGerando(true);
    setErro("");
    try {
      const reduzidas = (await Promise.all(fotos.map(reduzir))).filter((f): f is string => Boolean(f));
      const res = await fetch("/api/produtos/ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          texto,
          fotos: reduzidas,
          material,
          cor: valorDoForm("cor"),
          pesoG: Number(valorDoForm("pesoG")) || 0,
          altura: medidas.altura,
          largura: medidas.largura,
          profundidade: medidas.profundidade,
          quantidade: Number(quantidade) || 1,
        }),
      });
      const r = (await res.json().catch(() => ({ erro: "Resposta inválida do servidor." }))) as ResultadoIA & { erro?: string };
      if (!res.ok || r.erro) throw new Error(r.erro ?? "Falha ao gerar.");
      aplicar({ titulo: campos.titulo ? r.titulo : undefined, descricao: campos.descricao ? r.descricao : undefined, ncms: campos.ncm ? r.ncms : undefined });
      setAberto(false);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setGerando(false);
    }
  }

  return (
    <>
      <Button type="button" variant="gold" size="sm" onClick={abrir}>
        <Sparkles /> Gerar com IA
      </Button>
      {aberto ? (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4" onMouseDown={(e) => e.target === e.currentTarget && !gerando && setAberto(false)}>
          <div className="grid w-full max-w-lg gap-4 rounded-2xl border border-border bg-surface p-5 shadow-card">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gold/15 text-gold">
                <Sparkles className="size-5" />
              </span>
              <div className="flex-1">
                <p className="font-display text-lg font-bold">Vamos analisar suas fotos</p>
                <p className="text-sm text-muted">A IA olha as fotos e o que você contar e cria o título, a descrição e o NCM de uma vez.</p>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => setAberto(false)} disabled={gerando} aria-label="Fechar">
                <X />
              </Button>
            </div>

            {fotos.length ? (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {fotos.map((f) => (
                  <img key={f} src={f} alt="" className="size-16 shrink-0 rounded-lg border border-border object-cover" />
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-xl border border-dashed border-border p-3 text-sm text-muted">
                <ImageOff className="size-4 shrink-0" /> Nenhuma foto ainda. Adicione as fotos no card “Imagens” para a IA ver o produto (ou gere só pelo texto).
              </div>
            )}

            <label className="grid gap-1.5">
              <span className="text-sm font-semibold">O que você está vendendo?</span>
              <Textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                rows={3}
                autoFocus
                placeholder="Ex.: estrela dourada para topo de árvore de natal, encaixa na ponta da árvore"
              />
              <span className="text-xs text-muted">Diga para que serve e para quem é: a IA usa isso para vender o produto.</span>
            </label>

            <div className="grid grid-cols-3 gap-3">
              {(
                [
                  ["altura", "Altura (cm)"],
                  ["largura", "Largura (cm)"],
                  ["profundidade", "Profundidade (cm)"],
                ] as const
              ).map(([k, r]) => (
                <Field key={k} label={r}>
                  <Input inputMode="decimal" value={medidas[k]} onChange={(e) => setMedidas((m) => ({ ...m, [k]: e.target.value }))} placeholder="0" />
                </Field>
              ))}
              <Field label="Peças por pacote">
                <Input type="number" min={1} value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />
              </Field>
              <Field label="Material" className="col-span-2">
                <Select value={material} onChange={(e) => setMaterial(e.target.value)}>
                  {MATERIAIS.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
              <span className="font-semibold">Preencher:</span>
              {CAMPOS.map(([k, r]) => (
                <label key={k} className="flex items-center gap-1.5">
                  <input type="checkbox" checked={campos[k]} onChange={(e) => setCampos((c) => ({ ...c, [k]: e.target.checked }))} className="size-4 accent-[var(--gold)]" />
                  {r}
                </label>
              ))}
            </div>

            {erro ? <Alert>{erro}</Alert> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setAberto(false)} disabled={gerando}>
                Cancelar
              </Button>
              <Button type="button" variant="gold" onClick={gerar} disabled={gerando || !Object.values(campos).some(Boolean)}>
                {gerando ? <Loader2 className="animate-spin" /> : <Sparkles />} {gerando ? "Analisando suas fotos..." : "Gerar"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
