"use client";

import { ImagePlus, Layers, Plus, Trash2, Wand2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Badge, Button, Card, CardHeader, Input, Select } from "@/components/ui";
import { custoComposicao, gramasTotais, type Componente, type ParametrosImpressao } from "@/lib/impressao";
import { cn, formatBRL, formatValor, parseDecimal } from "@/lib/utils";

export type FilamentoOpt = { id: number; material: string; cor: string; marca: string; custoKg: number; saldoG: number; corHex: string };
export type VariacaoInicial = {
  id: string;
  sku: string;
  cor: string;
  material: string;
  filamentoId: number | null;
  preco: number;
  gtin: string;
  estoque: number;
  ativo: boolean;
  /** Fotos próprias da variação. */
  imagens?: string[];
  /** Tipo da variação (Cor, Tamanho...). */
  tipo?: string;
};
type Linha = {
  key: string;
  id?: string;
  sku: string;
  cor: string;
  material: string;
  filamentoId: string;
  preco: string;
  gtin: string;
  estoqueInicial: string;
  estoque?: number;
  ativo: boolean;
  imagens: string[];
  novas: { arquivo: File; url: string }[];
};

const TIPOS = ["Cor", "Tamanho", "Modelo", "Estampa", "Acabamento", "Material"];
const EXEMPLO: Record<string, string> = { Cor: "Verde", Tamanho: "P, 10 cm", Modelo: "Natal", Estampa: "Floral", Acabamento: "Fosco", Material: "PETG" };

/** Fotos da variação: as já salvas e as novas (essas vão no campo de arquivo fotosVar_<key>, enviado com o formulário). */
function FotosVariacao({ linha, alterar }: { linha: Linha; alterar: (patch: Partial<Linha>) => void }) {
  const input = useRef<HTMLInputElement>(null);
  // O campo de arquivo precisa ter exatamente as fotos novas da lista (inclusive depois de remover uma).
  useEffect(() => {
    if (!input.current) return;
    const dt = new DataTransfer();
    for (const n of linha.novas) dt.items.add(n.arquivo);
    input.current.files = dt.files;
  }, [linha.novas]);
  const miniatura = "relative size-14 shrink-0 overflow-hidden rounded-lg border border-border bg-white";
  const remover = "absolute top-0.5 right-0.5 grid size-4 place-items-center rounded-full bg-black/70 text-white";
  return (
    <div className="flex flex-wrap items-center gap-2">
      {linha.imagens.map((u) => (
        <div key={u} className={miniatura}>
          <img src={u} alt="" className="size-full object-cover" />
          <button type="button" className={remover} onClick={() => alterar({ imagens: linha.imagens.filter((x) => x !== u) })} aria-label="Remover foto">
            <X className="size-3" />
          </button>
        </div>
      ))}
      {linha.novas.map((n) => (
        <div key={n.url} className={cn(miniatura, "border-dashed border-gold")}>
          <img src={n.url} alt="" className="size-full object-cover" />
          <button type="button" className={remover} onClick={() => alterar({ novas: linha.novas.filter((x) => x !== n) })} aria-label="Remover foto">
            <X className="size-3" />
          </button>
        </div>
      ))}
      <input ref={input} type="file" name={`fotosVar_${linha.key}`} multiple className="hidden" tabIndex={-1} aria-hidden />
      <label className="grid size-14 shrink-0 cursor-pointer place-items-center rounded-lg border-2 border-dashed border-border text-muted hover:border-gold hover:text-gold" title="Adicionar fotos desta variação">
        <ImagePlus className="size-5" />
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(e) => {
            const fs = [...(e.target.files ?? [])];
            e.target.value = "";
            alterar({ novas: [...linha.novas, ...fs.map((arquivo) => ({ arquivo, url: URL.createObjectURL(arquivo) }))] });
          }}
        />
      </label>
      {!linha.imagens.length && !linha.novas.length ? <span className="text-xs text-muted">Sem foto própria: usa as fotos do produto.</span> : null}
    </div>
  );
}

const MATERIAIS = ["PLA", "PLA+", "PETG", "ABS", "ASA", "TPU", "PLA Silk", "PLA Matte", "Outro"];
const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 6);

/**
 * Variações do produto (cor, material/filamento): cada uma tem SKU, estoque, filamento, custo e preço próprios.
 * Vai para o servidor como JSON no campo "variacoes".
 */
export function VariacoesField({
  iniciais,
  filamentos,
  parametros,
  skuPai,
  precoPai,
  composicao,
  tempoMin,
  materialPai,
}: {
  iniciais: VariacaoInicial[];
  filamentos: FilamentoOpt[];
  parametros: ParametrosImpressao;
  skuPai: string;
  precoPai: number;
  composicao: Componente[];
  tempoMin: number;
  materialPai: string;
}) {
  const [linhas, setLinhas] = useState<Linha[]>(() =>
    iniciais.map((v) => ({
      key: v.id,
      id: v.id,
      sku: v.sku,
      cor: v.cor,
      material: v.material,
      filamentoId: v.filamentoId ? String(v.filamentoId) : "",
      preco: v.preco && v.preco !== precoPai ? formatValor(v.preco) : "",
      gtin: v.gtin,
      estoqueInicial: "",
      estoque: v.estoque,
      ativo: v.ativo,
      imagens: v.imagens ?? [],
      novas: [],
    })),
  );
  const [tipo, setTipo] = useState(iniciais[0]?.tipo || "Cor");
  const outroTipo = !TIPOS.includes(tipo);
  const [escolhendo, setEscolhendo] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!escolhendo) return;
    const fora = (e: MouseEvent) => !caixa.current?.contains(e.target as Node) && setEscolhendo(false);
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [escolhendo]);

  const atualizar = (key: string, patch: Partial<Linha>) => setLinhas((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const skuSugerido = (cor: string, material: string, usados: string[]) => {
    const base = [skuPai || "VAR", slug(cor), material && material !== materialPai ? slug(material) : ""].filter(Boolean).join("-");
    let sku = base;
    for (let n = 2; usados.includes(sku); n++) sku = `${base}-${n}`;
    return sku;
  };
  const nova = (f?: FilamentoOpt, usados: string[] = linhas.map((l) => l.sku)): Linha => {
    const cor = f?.cor ?? "";
    const material = f ? (MATERIAIS.includes(f.material) ? f.material : "Outro") : materialPai || "PLA";
    return {
      key: `n${Math.random()}`,
      sku: f ? skuSugerido(cor, material, usados) : "",
      cor,
      material,
      filamentoId: f ? String(f.id) : "",
      preco: "",
      gtin: "",
      estoqueInicial: "",
      ativo: true,
      imagens: [],
      novas: [],
    };
  };
  const usados = new Set(linhas.map((l) => l.filamentoId).filter(Boolean));
  const disponiveis = filamentos.filter((f) => !usados.has(String(f.id)));

  // O 1º filamento da composição vira o da cor da variação; os demais continuam iguais.
  const compDe = (l: Linha): Componente[] => {
    const base = composicao.length ? composicao : [{ filamentoId: null, gramas: 0 }];
    return base.map((c, i) => (i === 0 ? { ...c, filamentoId: l.filamentoId ? Number(l.filamentoId) : null } : c));
  };
  const custoDe = (l: Linha) => custoComposicao(compDe(l), tempoMin, parametros, filamentos).custo;
  const filamentoG = gramasTotais(composicao);
  const json = JSON.stringify(
    linhas.map((l) => ({
      id: l.id,
      sku: l.sku.trim(),
      cor: l.cor.trim(),
      material: l.material,
      filamentoId: l.filamentoId ? Number(l.filamentoId) : null,
      preco: l.preco.trim() ? parseDecimal(l.preco) : null,
      custo: custoDe(l),
      gtin: l.gtin.trim(),
      estoqueInicial: Math.max(0, Math.round(parseDecimal(l.estoqueInicial))),
      ativo: l.ativo,
      imagens: l.imagens,
      campoFotos: l.key,
    })),
  );

  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Layers className="size-4 text-gold" /> Variações
          </span>
        }
        description="Cada variação (ex.: Cor → Verde) vira um item com SKU, foto, estoque, custo e preço próprios. Nome, fiscal e medidas vêm do produto principal."
        action={
          <div ref={caixa} className="relative flex gap-2">
            {filamentos.length ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setEscolhendo((v) => !v)} disabled={!disponiveis.length}>
                <Wand2 /> Criar pelos filamentos
              </Button>
            ) : null}
            <Button type="button" variant="outline" size="sm" onClick={() => setLinhas((ls) => [...ls, nova()])}>
              <Plus /> Variação
            </Button>
            {escolhendo ? (
              <div className="absolute top-full right-0 z-30 mt-1 w-72 rounded-xl border border-border bg-surface p-2 shadow-card">
                <p className="px-2 pb-1 text-xs text-muted">Uma variação para cada filamento escolhido:</p>
                <div className="max-h-64 overflow-y-auto">
                  {disponiveis.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setLinhas((ls) => [...ls, nova(f, ls.map((l) => l.sku))])}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2"
                    >
                      <span className="size-4 shrink-0 rounded-full ring-1 ring-black/20" style={{ background: f.corHex }} />
                      <span className="flex-1 truncate">
                        {f.material} {f.cor}
                        {f.marca ? <span className="text-muted"> · {f.marca}</span> : null}
                      </span>
                      <span className="text-xs text-muted">{(f.saldoG / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg</span>
                    </button>
                  ))}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="gold"
                  className="mt-2 w-full"
                  onClick={() => {
                    setLinhas((ls) => {
                      const out = [...ls];
                      for (const f of disponiveis) out.push(nova(f, out.map((l) => l.sku)));
                      return out;
                    });
                    setEscolhendo(false);
                  }}
                >
                  Todos ({disponiveis.length})
                </Button>
              </div>
            ) : null}
          </div>
        }
      />
      <input type="hidden" name="variacoes" value={json} />
      <input type="hidden" name="tipoVariacao" value={tipo} />
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
        <span className="text-sm font-semibold">Tipo de variação</span>
        <Select value={outroTipo ? "outro" : tipo} onChange={(e) => setTipo(e.target.value === "outro" ? "" : e.target.value)} className="h-9 w-44 text-sm" aria-label="Tipo de variação">
          {TIPOS.map((t) => (
            <option key={t}>{t}</option>
          ))}
          <option value="outro">Outro...</option>
        </Select>
        {outroTipo ? (
          <Input value={tipo} onChange={(e) => setTipo(e.target.value)} placeholder="Nome do tipo (ex.: Sabor)" className="h-9 w-48 text-sm" required aria-label="Nome do tipo de variação" />
        ) : null}
      </div>
      {linhas.length === 0 ? (
        <p className="p-5 text-sm text-muted">
          Nenhuma variação ainda. Use <strong>Criar pelos filamentos</strong> para gerar uma por cor do seu estoque, ou <strong>+ Variação</strong>.
        </p>
      ) : (
        // Uma linha por variação, com os campos quebrando conforme a largura (sem rolagem lateral).
        <div className="divide-y divide-border">
          {linhas.map((l) => {
            const fil = filamentos.find((f) => String(f.id) === l.filamentoId);
            const rotulo = (t: string) => <span className="mb-1 block text-[11px] font-semibold tracking-wide text-muted uppercase">{t}</span>;
            return (
              <div key={l.key} className={cn("grid gap-3 px-5 py-4", !l.ativo && "opacity-50")}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="size-5 shrink-0 rounded-full ring-1 ring-black/20" style={{ background: fil?.corHex ?? "transparent" }} />
                  <span className="text-sm font-semibold text-muted">{tipo || "Valor"}</span>
                  <Input
                    value={l.cor}
                    onChange={(e) => atualizar(l.key, { cor: e.target.value })}
                    placeholder={`ex.: ${EXEMPLO[tipo] ?? "Verde"}`}
                    className="h-9 w-40 font-semibold"
                    aria-label={tipo || "Valor da variação"}
                    required
                  />
                  <span className="text-sm text-muted">custo {formatBRL(custoDe(l))}</span>
                  <span className="ml-auto flex items-center gap-1">
                    <label className="inline-flex items-center gap-1 text-xs text-muted" title="Variação ativa (aparece nos pedidos e notas)">
                      <input type="checkbox" checked={l.ativo} onChange={(e) => atualizar(l.key, { ativo: e.target.checked })} className="accent-[var(--gold)]" />
                      ativa
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      title="Remover variação"
                      className="hover:text-red"
                      onClick={() =>
                        (!l.id || confirm(`Remover a variação ${l.cor || l.sku}? Se ela já teve movimento de estoque, fica só desativada.`)) &&
                        setLinhas((ls) => ls.filter((x) => x.key !== l.key))
                      }
                    >
                      <Trash2 />
                    </Button>
                  </span>
                </div>
                <FotosVariacao linha={l} alterar={(patch) => atualizar(l.key, patch)} />
                <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                  <label className="sm:col-span-2 2xl:col-span-1">
                    {rotulo("Filamento do estoque")}
                    <Select
                      value={l.filamentoId}
                      onChange={(e) => {
                        const f = filamentos.find((x) => String(x.id) === e.target.value);
                        atualizar(l.key, {
                          filamentoId: e.target.value,
                          ...(f ? { cor: l.cor || f.cor, material: MATERIAIS.includes(f.material) ? f.material : "Outro" } : {}),
                        });
                      }}
                      className="h-9 text-sm"
                      aria-label="Filamento do estoque"
                    >
                      <option value="">Nenhum</option>
                      {filamentos.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.material} {f.cor}
                          {f.marca ? ` (${f.marca})` : ""}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label>
                    {rotulo("Material")}
                    <Select value={l.material} onChange={(e) => atualizar(l.key, { material: e.target.value })} className="h-9 text-sm">
                      {MATERIAIS.map((m) => (
                        <option key={m}>{m}</option>
                      ))}
                    </Select>
                  </label>
                  <label>
                    {rotulo("SKU")}
                    <Input
                      value={l.sku}
                      onChange={(e) => atualizar(l.key, { sku: e.target.value })}
                      onFocus={() => !l.sku && l.cor && atualizar(l.key, { sku: skuSugerido(l.cor, l.material, linhas.map((x) => x.sku)) })}
                      placeholder="SKU"
                      className="h-9 font-mono text-xs"
                      required
                    />
                  </label>
                  <label>
                    {rotulo("Preço (R$)")}
                    <Input
                      value={l.preco}
                      inputMode="decimal"
                      onChange={(e) => atualizar(l.key, { preco: e.target.value })}
                      onBlur={() => l.preco.trim() && atualizar(l.key, { preco: formatValor(parseDecimal(l.preco)) })}
                      placeholder={precoPai ? formatValor(precoPai) : "igual ao produto"}
                      title="Vazio = mesmo preço do produto"
                      className="h-9"
                    />
                  </label>
                  <label>
                    {rotulo(l.id ? "Estoque" : "Estoque inicial")}
                    {l.id ? (
                      <Link href={`/estoque/${l.id}`} className="flex h-9 items-center rounded-xl border border-border px-3 text-sm font-semibold hover:border-gold" title="Movimentar no Estoque">
                        {l.estoque ?? 0} un. <span className="ml-auto text-xs font-normal text-gold">movimentar →</span>
                      </Link>
                    ) : (
                      <Input value={l.estoqueInicial} inputMode="numeric" onChange={(e) => atualizar(l.key, { estoqueInicial: e.target.value })} placeholder="0" className="h-9" />
                    )}
                  </label>
                  <label>
                    {rotulo("GTIN / EAN")}
                    <Input value={l.gtin} inputMode="numeric" onChange={(e) => atualizar(l.key, { gtin: e.target.value })} placeholder="opcional" className="h-9" />
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {linhas.length ? (
        <p className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-3 text-xs text-muted">
          <Badge>{linhas.length} variação(ões)</Badge>
          Custo calculado com o filamento de cada variação ({filamentoG} g, {tempoMin} min). Preço vazio = preço do produto.
        </p>
      ) : null}
    </Card>
  );
}
