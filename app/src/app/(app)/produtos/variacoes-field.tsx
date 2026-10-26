"use client";

import { Layers, Plus, Trash2, Wand2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Badge, Button, Card, CardHeader, Input, Select } from "@/components/ui";
import { custoImpressao, type ParametrosImpressao } from "@/lib/impressao";
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
};

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
  filamentoG,
  tempoMin,
  materialPai,
}: {
  iniciais: VariacaoInicial[];
  filamentos: FilamentoOpt[];
  parametros: ParametrosImpressao;
  skuPai: string;
  precoPai: number;
  filamentoG: number;
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
    })),
  );
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
    };
  };
  const usados = new Set(linhas.map((l) => l.filamentoId).filter(Boolean));
  const disponiveis = filamentos.filter((f) => !usados.has(String(f.id)));

  const custoDe = (l: Linha) => {
    const fil = filamentos.find((f) => String(f.id) === l.filamentoId);
    return custoImpressao(filamentoG, tempoMin, fil && fil.custoKg > 0 ? { ...parametros, custoFilamentoKg: fil.custoKg } : parametros).custo;
  };
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
        description="Cada cor/filamento vira um item com SKU, estoque, custo e preço próprios. Nome, fiscal, fotos e medidas vêm do produto principal."
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
      {linhas.length === 0 ? (
        <p className="p-5 text-sm text-muted">
          Nenhuma variação ainda. Use <strong>Criar pelos filamentos</strong> para gerar uma por cor do seu estoque, ou <strong>+ Variação</strong>.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="table-base min-w-[980px]">
            <thead>
              <tr>
                <th>Cor / filamento</th>
                <th>Material</th>
                <th>SKU</th>
                <th className="text-right">Custo</th>
                <th>Preço (R$)</th>
                <th>Estoque</th>
                <th>GTIN</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => {
                const fil = filamentos.find((f) => String(f.id) === l.filamentoId);
                return (
                  <tr key={l.key} className={cn(!l.ativo && "opacity-50")}>
                    <td className="min-w-56">
                      <div className="flex items-center gap-2">
                        <span className="size-4 shrink-0 rounded-full ring-1 ring-black/20" style={{ background: fil?.corHex ?? "transparent" }} />
                        <Input value={l.cor} onChange={(e) => atualizar(l.key, { cor: e.target.value })} placeholder="Cor (ex.: Preto)" className="h-9 w-48" required />
                      </div>
                      <Select
                        value={l.filamentoId}
                        onChange={(e) => {
                          const f = filamentos.find((x) => String(x.id) === e.target.value);
                          atualizar(l.key, {
                            filamentoId: e.target.value,
                            ...(f ? { cor: l.cor || f.cor, material: MATERIAIS.includes(f.material) ? f.material : "Outro" } : {}),
                          });
                        }}
                        className="mt-1.5 h-8 w-54 text-xs"
                        aria-label="Filamento do estoque"
                      >
                        <option value="">Filamento do estoque: nenhum</option>
                        {filamentos.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.material} {f.cor}
                            {f.marca ? ` (${f.marca})` : ""}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="min-w-28">
                      <Select value={l.material} onChange={(e) => atualizar(l.key, { material: e.target.value })} className="h-9 w-32">
                        {MATERIAIS.map((m) => (
                          <option key={m}>{m}</option>
                        ))}
                      </Select>
                    </td>
                    <td className="min-w-36">
                      <Input
                        value={l.sku}
                        onChange={(e) => atualizar(l.key, { sku: e.target.value })}
                        onFocus={() => !l.sku && l.cor && atualizar(l.key, { sku: skuSugerido(l.cor, l.material, linhas.map((x) => x.sku)) })}
                        placeholder="SKU"
                        className="h-9 w-48 font-mono text-xs"
                        required
                      />
                    </td>
                    <td className="text-right whitespace-nowrap text-muted">{formatBRL(custoDe(l))}</td>
                    <td className="min-w-28">
                      <Input
                        value={l.preco}
                        inputMode="decimal"
                        onChange={(e) => atualizar(l.key, { preco: e.target.value })}
                        onBlur={() => l.preco.trim() && atualizar(l.key, { preco: formatValor(parseDecimal(l.preco)) })}
                        placeholder={precoPai ? formatValor(precoPai) : "igual"}
                        title="Vazio = mesmo preço do produto"
                        className="h-9 w-28"
                      />
                    </td>
                    <td className="min-w-24 whitespace-nowrap">
                      {l.id ? (
                        <Link href={`/estoque/${l.id}`} className="text-sm font-semibold hover:text-gold" title="Movimentar no Estoque">
                          {l.estoque ?? 0} un.
                        </Link>
                      ) : (
                        <Input
                          value={l.estoqueInicial}
                          inputMode="numeric"
                          onChange={(e) => atualizar(l.key, { estoqueInicial: e.target.value })}
                          placeholder="inicial"
                          className="h-9 w-20"
                        />
                      )}
                    </td>
                    <td className="min-w-32">
                      <Input value={l.gtin} inputMode="numeric" onChange={(e) => atualizar(l.key, { gtin: e.target.value })} placeholder="opcional" className="h-9 w-36" />
                    </td>
                    <td className="whitespace-nowrap">
                      <label className="mr-1 inline-flex items-center gap-1 text-xs text-muted" title="Variação ativa (aparece nos pedidos e notas)">
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
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
