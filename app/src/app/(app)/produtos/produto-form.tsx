"use client";

import { Calculator, Plus, Printer, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Alert, Button, Card, CardHeader, Field, Input, Select, Textarea } from "@/components/ui";
import { SubmitButton, useFormAction } from "@/components/ui/client";
import type { Produto } from "@/db/schema";
import { custoComposicao, gramasTotais, type ParametrosImpressao } from "@/lib/impressao";
import type { ParametrosPreco } from "@/lib/precificacao";
import { formatBRL, formatGramas, formatValor, parseDecimal, precoGrama } from "@/lib/utils";
import { salvarProduto } from "./actions";
import { CadastroIA, type ResultadoIA } from "./cadastro-ia";
import { NcmField } from "./ncm-field";
import { ImagensField } from "./imagens-field";
import { PrecosCanal } from "./precos-canal";
import { VariacoesField, type VariacaoInicial } from "./variacoes-field";
import { VideosField } from "./videos-field";

const ORIGENS = [
  "0 - Nacional",
  "1 - Estrangeira (importação direta)",
  "2 - Estrangeira (adquirida no mercado interno)",
  "3 - Nacional, conteúdo de importação > 40% e ≤ 70%",
  "4 - Nacional, processos produtivos básicos",
  "5 - Nacional, conteúdo de importação ≤ 40%",
  "6 - Estrangeira (importação direta, sem similar)",
  "7 - Estrangeira (mercado interno, sem similar)",
  "8 - Nacional, conteúdo de importação > 70%",
];
const MATERIAIS = ["PLA", "PLA+", "PETG", "ABS", "ASA", "TPU", "PLA Silk", "PLA Matte", "Outro"];
const fmt = (n: number | undefined) => (n ? String(n).replace(".", ",") : "");

type FilamentoOpt = { id: number; material: string; cor: string; marca: string; custoKg: number; saldoG: number; corHex: string };

export function ProdutoForm({
  produto,
  parametros,
  precos,
  filamentos = [],
  variacoes = [],
  categorias = [],
}: {
  produto?: Produto;
  parametros: ParametrosImpressao;
  precos: ParametrosPreco;
  filamentos?: FilamentoOpt[];
  variacoes?: VariacaoInicial[];
  categorias?: { id: number; nome: string }[];
}) {
  const [temVariacoes, setTemVariacoes] = useState(produto?.temVariacoes ?? false);
  const [sku, setSku] = useState(produto?.sku ?? "");
  const [nome, setNome] = useState(produto?.nome ?? "");
  const [descricao, setDescricao] = useState(produto?.descricao ?? "");
  const [ia, setIa] = useState<ResultadoIA | null>(null);
  const aplicarIA = (r: ResultadoIA) => {
    if (r.titulo) setNome(r.titulo);
    if (r.descricao) setDescricao(r.descricao);
    setIa({ ...r, ncm: r.ncm || undefined });
  };
  const [precosCanal, setPrecosCanal] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(produto?.precosCanal ?? {}).map(([k, v]) => [k, v ? formatValor(v) : ""])),
  );
  // Partes da peça: cada linha é um filamento com as gramas e o tempo de impressão daquela parte
  // (peça impressa em partes e encaixada; sem AMS). Material, cor, total de gramas e tempo saem daqui.
  const [composicao, setComposicao] = useState<{ key: number; filamentoId: string; gramas: number; tempoMin: number }[]>(() => {
    const base = produto?.composicao?.length
      ? produto.composicao
      : [{ filamentoId: produto?.filamentoId ?? null, gramas: produto?.filamentoG ?? 0 }];
    // Cadastro antigo (tempo só no total): o tempo fica na 1ª parte.
    const semTempo = base.every((c) => !c.tempoMin);
    return base.map((c, i) => ({
      key: i,
      filamentoId: c.filamentoId ? String(c.filamentoId) : "",
      gramas: c.gramas,
      tempoMin: semTempo ? (i === 0 ? (produto?.tempoImpressaoMin ?? 0) : 0) : (c.tempoMin ?? 0),
    }));
  });
  const filamentoId = composicao[0]?.filamentoId ?? "";
  const fil = filamentos.find((f) => String(f.id) === filamentoId);
  const [state, onSubmit, pending] = useFormAction(salvarProduto, null);
  const comp = composicao.map((c) => ({ filamentoId: c.filamentoId ? Number(c.filamentoId) : null, gramas: c.gramas || 0, tempoMin: c.tempoMin || 0 }));
  const filamentoG = gramasTotais(comp);
  const tempoMin = comp.reduce((s, c) => s + c.tempoMin, 0);
  const usados = composicao.map((c) => filamentos.find((f) => String(f.id) === c.filamentoId)).filter((f): f is FilamentoOpt => Boolean(f));
  // Material e cor do cadastro: os dos filamentos usados (sem filamento do estoque, mantém o que já estava).
  const material = usados[0] ? (MATERIAIS.includes(usados[0].material) ? usados[0].material : "Outro") : produto?.material || "PLA";
  const cor = usados.length ? [...new Set(usados.map((f) => f.cor))].join(", ") : (produto?.cor ?? "");
  const alterarComp = (key: number, patch: Partial<{ filamentoId: string; gramas: number; tempoMin: number }>) =>
    setComposicao((cs) => cs.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  const [custo, setCusto] = useState(produto?.custo ? formatValor(produto.custo) : "");
  const [preco, setPreco] = useState(produto?.preco ? formatValor(produto.preco) : "");
  // Ao sair do campo, o valor fica com 2 casas (49,9 → 49,90).
  const normalizar = (v: string) => (v.trim() ? formatValor(parseDecimal(v)) : "");

  // Cada filamento do estoque entra com o custo médio do kg dele.
  const calc = useMemo(() => custoComposicao(comp, tempoMin, parametros, filamentos), [JSON.stringify(comp), tempoMin, parametros, filamentos]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <form onSubmit={onSubmit} className="grid gap-6 xl:grid-cols-3">
      {produto ? <input type="hidden" name="id" value={produto.id} /> : null}
      <input type="hidden" name="temVariacoes" value={temVariacoes ? "1" : ""} />
      <input
        type="hidden"
        name="precosCanal"
        value={JSON.stringify(Object.fromEntries(Object.entries(precosCanal).filter(([k, v]) => k !== "loja" && v.trim()).map(([k, v]) => [k, parseDecimal(v)])))}
      />

      <div className="grid min-w-0 content-start gap-6 xl:col-span-2 [&>*]:min-w-0">
        <Card>
          <CardHeader
            title="Identificação"
            action={
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <CadastroIA aplicar={aplicarIA} />
                <span className="font-semibold">Tem variações?</span>
                <div className="flex rounded-xl border border-border bg-surface p-0.5">
                  {[
                    [false, "Não"],
                    [true, "Sim"],
                  ].map(([v, rotulo]) => (
                    <button
                      key={String(v)}
                      type="button"
                      onClick={() => setTemVariacoes(v as boolean)}
                      className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${temVariacoes === v ? "bg-primary text-primary-fg" : "text-muted hover:text-foreground"}`}
                    >
                      {rotulo as string}
                    </button>
                  ))}
                </div>
              </div>
            }
          />
          <div className="grid gap-4 p-5 sm:grid-cols-6">
            <Field label={temVariacoes ? "SKU base" : "SKU"} className="sm:col-span-2" hint={temVariacoes ? "As variações usam SKU-COR" : undefined}>
              <Input name="sku" value={sku} onChange={(e) => setSku(e.target.value)} required placeholder="ARV-0001" />
            </Field>
            <Field label="Nome do produto" className="sm:col-span-4">
              <Input name="nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
            </Field>
            <Field label="Categoria" className="sm:col-span-6" hint="Separa o produto nas grades e no site. Gerencie em Cadastros › Categorias.">
              <Select name="categoriaId" defaultValue={produto?.categoriaId ?? ""}>
                <option value="">Sem categoria</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </Select>
            </Field>
            {ia ? (
              <div className="sm:col-span-6">
                <Alert tone="gold">Preenchido pela IA: confira o título e a descrição antes de salvar.</Alert>
              </div>
            ) : null}
            <Field label="Descrição" className="sm:col-span-6" hint="Use “Gerar com IA” para criar título, descrição e NCM pelas fotos.">
              <Textarea name="descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={descricao.split("\n").length > 5 ? 10 : 5} />
            </Field>
            <Field label="GTIN / EAN" className="sm:col-span-2" hint="Deixe vazio se não tiver">
              <Input name="gtin" defaultValue={produto?.gtin} inputMode="numeric" />
            </Field>
            {temVariacoes ? (
              <Field label="Estoque" className="sm:col-span-2" hint="Fica em cada variação.">
                <div className="flex h-10 items-center rounded-xl border border-border px-3 text-sm font-semibold">
                  {variacoes.reduce((s, v) => s + v.estoque, 0)} un. no total
                </div>
              </Field>
            ) : produto ? (
              <Field
                label="Estoque"
                className="sm:col-span-2"
                hint={
                  <>
                    A mudança entra no histórico como ajuste.{" "}
                    <Link href={`/estoque/${produto.id}`} className="text-gold hover:underline">
                      Ver histórico
                    </Link>
                  </>
                }
              >
                <input type="hidden" name="estoqueAntes" value={produto.estoque} />
                <Input name="estoque" type="number" step={1} defaultValue={produto.estoque} />
              </Field>
            ) : (
              <Field label="Estoque inicial" className="sm:col-span-2" hint="Entra no kardex como saldo inicial.">
                <Input name="estoque" type="number" min={0} defaultValue={0} />
              </Field>
            )}
            <Field label="Unidade" className="sm:col-span-2">
              <Input name="unidade" defaultValue={produto?.unidade ?? "UN"} maxLength={6} />
            </Field>
          </div>
        </Card>

        {temVariacoes ? (
          <VariacoesField
            iniciais={variacoes}
            filamentos={filamentos}
            parametros={parametros}
            skuPai={sku}
            precoPai={parseDecimal(preco)}
            composicao={comp}
            tempoMin={tempoMin}
            materialPai={material}
          />
        ) : null}

        <Card>
          <CardHeader title="Fiscal" description="O NCM define a regra da matriz fiscal, o IPI e os tributos aproximados da nota." />
          <div className="grid gap-4 p-5 sm:grid-cols-6">
            <NcmField defaultValue={produto?.ncm} valorIA={ia?.ncm} />
            <Field label="CEST" className="sm:col-span-3" hint="Só se houver substituição tributária">
              <Input name="cest" defaultValue={produto?.cest} inputMode="numeric" />
            </Field>
            <Field label="Origem" className="sm:col-span-3">
              <Select name="origem" defaultValue={produto?.origem ?? 0}>
                {ORIGENS.map((o, i) => (
                  <option key={o} value={i}>
                    {o}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Card>

        <ImagensField iniciais={produto?.imagens ?? []} produtoId={produto?.id} sku={produto?.sku} />
        <VideosField iniciais={produto?.videos ?? []} produtoId={produto?.id} sku={produto?.sku} />
      </div>

      <div className="grid content-start gap-6">
        <Card className="overflow-hidden">
          <CardHeader title="Impressão 3D" description="Bambu Lab A1 mini" action={<Printer className="size-5 text-gold" />} />
          <div className="grid gap-2 p-5">
            <input type="hidden" name="composicao" value={JSON.stringify(comp.filter((c) => c.filamentoId || c.gramas || c.tempoMin))} />
            <input type="hidden" name="filamentoId" value={filamentoId} />
            <input type="hidden" name="filamentoG" value={filamentoG} />
            <input type="hidden" name="tempoImpressaoMin" value={tempoMin} />
            <input type="hidden" name="material" value={material} />
            <input type="hidden" name="cor" value={cor} />
            <span className="text-[11px] font-semibold tracking-wide text-muted uppercase">Filamento de cada parte</span>
            {composicao.map((c, i) => {
              const f = filamentos.find((x) => String(x.id) === c.filamentoId);
              return (
                <div key={c.key} className="grid grid-cols-[1fr_1fr_36px] items-center gap-2 rounded-xl border border-border p-2">
                  <div className="col-span-3 flex min-w-0 items-center gap-2">
                    <span className="size-4 shrink-0 rounded-full ring-1 ring-black/20" style={{ background: f?.corHex ?? "transparent" }} />
                    <Select
                      value={c.filamentoId}
                      onChange={(e) => alterarComp(c.key, { filamentoId: e.target.value })}
                      className="h-9 min-w-0 text-sm"
                      aria-label={`Filamento ${i + 1}`}
                    >
                      <option value="">{i === 0 && temVariacoes ? "Cor da variação" : "Sem filamento do estoque"}</option>
                      {filamentos.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.material} {x.cor}
                          {x.marca ? ` (${x.marca})` : ""} · {formatGramas(x.saldoG)}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="relative">
                    <Input
                      type="number"
                      min={0}
                      value={c.gramas || ""}
                      onChange={(e) => alterarComp(c.key, { gramas: Number(e.target.value) })}
                      placeholder="0"
                      className="h-9 pr-14 pl-3"
                      aria-label={`Gramas do filamento ${i + 1}`}
                    />
                    <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted">gramas</span>
                  </div>
                  <div className="relative">
                    <Input
                      type="number"
                      min={0}
                      value={c.tempoMin || ""}
                      onChange={(e) => alterarComp(c.key, { tempoMin: Number(e.target.value) })}
                      placeholder="0"
                      className="h-9 pr-12 pl-3"
                      aria-label={`Tempo do filamento ${i + 1}`}
                      title="Tempo de impressão desta parte (minutos)"
                    />
                    <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted">min</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="hover:text-red"
                    disabled={composicao.length === 1}
                    onClick={() => setComposicao((cs) => cs.filter((x) => x.key !== c.key))}
                    title="Remover"
                  >
                    <Trash2 />
                  </Button>
                </div>
              );
            })}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={() => setComposicao((cs) => [...cs, { key: Date.now(), filamentoId: "", gramas: 0, tempoMin: 0 }])}>
                <Plus /> Filamento
              </Button>
              <span className="text-sm">
                Total: <strong>{filamentoG} g</strong> · <strong>{Math.floor(tempoMin / 60)}h{String(tempoMin % 60).padStart(2, "0")}</strong>
              </span>
            </div>
            <p className="text-xs text-muted">
              {temVariacoes
                ? "O 1º filamento muda conforme a cor de cada variação; os demais são iguais em todas."
                : composicao.length > 1
                  ? "Cada parte com o seu filamento e tempo. A produção baixa cada filamento."
                  : fil
                    ? `${formatGramas(fil.saldoG)} em estoque · ${precoGrama(fil.custoKg)}`
                    : "Escolha o filamento para baixar na produção e usar o custo médio. Peça em várias cores: + Filamento."}
            </p>
          </div>
          <div className="grid gap-1.5 border-t border-border bg-surface-2 p-5 text-sm">
            <div className="flex justify-between text-muted">
              <span>Material</span>
              <span>{formatBRL(calc.material)}</span>
            </div>
            <div className="flex justify-between text-muted">
              <span>Energia</span>
              <span>{formatBRL(calc.energia)}</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span>Custo de produção</span>
              <span>{formatBRL(calc.custo)}</span>
            </div>
            <Button type="button" variant="outline" size="sm" className="mt-2" disabled={!calc.custo} onClick={() => setCusto(formatValor(calc.custo))}>
              <Calculator /> Usar como custo
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader title="Custo, peso e medidas" />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Custo (R$)">
              <Input name="custo" inputMode="decimal" value={custo} onChange={(e) => setCusto(e.target.value)} onBlur={() => setCusto(normalizar(custo))} />
            </Field>
            <Field label="Peso c/ embalagem (g)">
              <Input name="pesoG" type="number" min={0} defaultValue={produto?.pesoG ?? 0} />
            </Field>
            <Field label="Altura (cm)">
              <Input name="alturaCm" inputMode="decimal" defaultValue={fmt(produto?.alturaCm)} />
            </Field>
            <Field label="Largura (cm)">
              <Input name="larguraCm" inputMode="decimal" defaultValue={fmt(produto?.larguraCm)} />
            </Field>
            <Field label="Comprimento (cm)">
              <Input name="comprimentoCm" inputMode="decimal" defaultValue={fmt(produto?.comprimentoCm)} />
            </Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="ativo" defaultChecked={produto?.ativo ?? true} className="size-4 accent-[var(--gold)]" />
              Produto ativo
            </label>
          </div>
        </Card>

        <PrecosCanal
          custo={parseDecimal(custo) || calc.custo}
          preco={preco}
          parametros={precos}
          setPreco={setPreco}
          precosCanal={precosCanal}
          alterar={(canal, v) => setPrecosCanal((p) => ({ ...p, [canal]: v }))}
        />

        {state?.erro ? <Alert>{state.erro}</Alert> : null}
        <SubmitButton pending={pending} size="lg" pendingText="Salvando...">
          {produto ? "Salvar alterações" : "Cadastrar produto"}
        </SubmitButton>
      </div>
    </form>
  );
}
