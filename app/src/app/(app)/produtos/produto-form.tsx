"use client";

import { Calculator, Printer } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Alert, Button, Card, CardHeader, Field, Input, Select, Textarea } from "@/components/ui";
import { SubmitButton, useFormAction } from "@/components/ui/client";
import type { Produto } from "@/db/schema";
import { custoImpressao, type ParametrosImpressao } from "@/lib/impressao";
import type { ParametrosPreco } from "@/lib/precificacao";
import { formatBRL, formatValor, parseDecimal } from "@/lib/utils";
import { salvarProduto } from "./actions";
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
}: {
  produto?: Produto;
  parametros: ParametrosImpressao;
  precos: ParametrosPreco;
  filamentos?: FilamentoOpt[];
  variacoes?: VariacaoInicial[];
}) {
  const [temVariacoes, setTemVariacoes] = useState(produto?.temVariacoes ?? false);
  const [sku, setSku] = useState(produto?.sku ?? "");
  const [precosCanal, setPrecosCanal] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(produto?.precosCanal ?? {}).map(([k, v]) => [k, v ? formatValor(v) : ""])),
  );
  const [filamentoId, setFilamentoId] = useState(produto?.filamentoId ? String(produto.filamentoId) : "");
  const [material, setMaterial] = useState(produto?.material || "PLA");
  const [cor, setCor] = useState(produto?.cor ?? "");
  const fil = filamentos.find((f) => String(f.id) === filamentoId);
  const [state, onSubmit, pending] = useFormAction(salvarProduto, null);
  const [filamentoG, setFilamentoG] = useState(produto?.filamentoG ?? 0);
  const [tempoMin, setTempoMin] = useState(produto?.tempoImpressaoMin ?? 0);
  const [custo, setCusto] = useState(produto?.custo ? formatValor(produto.custo) : "");
  const [preco, setPreco] = useState(produto?.preco ? formatValor(produto.preco) : "");
  // Ao sair do campo, o valor fica com 2 casas (49,9 → 49,90).
  const normalizar = (v: string) => (v.trim() ? formatValor(parseDecimal(v)) : "");

  // Com filamento do estoque, o custo do material usa o custo médio dele.
  const calc = useMemo(
    () => custoImpressao(filamentoG, tempoMin, fil && fil.custoKg > 0 ? { ...parametros, custoFilamentoKg: fil.custoKg } : parametros),
    [filamentoG, tempoMin, parametros, fil],
  );
  const margemReal = parseDecimal(preco) > 0 && parseDecimal(custo) > 0 ? (parseDecimal(preco) / parseDecimal(custo) - 1) * 100 : null;

  return (
    <form onSubmit={onSubmit} className="grid gap-6 xl:grid-cols-3">
      {produto ? <input type="hidden" name="id" value={produto.id} /> : null}
      <input type="hidden" name="temVariacoes" value={temVariacoes ? "1" : ""} />
      <input
        type="hidden"
        name="precosCanal"
        value={JSON.stringify(Object.fromEntries(Object.entries(precosCanal).filter(([, v]) => v.trim()).map(([k, v]) => [k, parseDecimal(v)])))}
      />

      <div className="grid min-w-0 content-start gap-6 xl:col-span-2 [&>*]:min-w-0">
        <Card>
          <CardHeader
            title="Identificação"
            action={
              <div className="flex items-center gap-2 text-sm">
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
              <Input name="nome" defaultValue={produto?.nome} required />
            </Field>
            <Field label="Descrição" className="sm:col-span-6" hint="Use o Assistente IA na página do produto para gerar a descrição do anúncio.">
              <Textarea name="descricao" defaultValue={produto?.descricao} rows={5} />
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
              <Field label="Estoque" className="sm:col-span-2" hint="Entradas, saídas e contagens ficam no Estoque.">
                <Link href={`/estoque/${produto.id}`} className="flex h-10 items-center justify-between rounded-xl border border-border px-3 text-sm hover:border-gold">
                  <span className="font-semibold">{produto.estoque} un.</span>
                  <span className="text-xs text-gold">movimentar →</span>
                </Link>
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
            filamentoG={filamentoG}
            tempoMin={tempoMin}
            materialPai={material}
          />
        ) : null}

        <Card>
          <CardHeader title="Fiscal" description="O NCM define a regra da matriz fiscal, o IPI e os tributos aproximados da nota." />
          <div className="grid gap-4 p-5 sm:grid-cols-6">
            <NcmField defaultValue={produto?.ncm} />
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

        <ImagensField iniciais={produto?.imagens ?? []} />
        <VideosField iniciais={produto?.videos ?? []} />
      </div>

      <div className="grid content-start gap-6">
        <Card className="overflow-hidden">
          <CardHeader title="Impressão 3D" description="Bambu Lab A1 mini" action={<Printer className="size-5 text-gold" />} />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label={temVariacoes ? "Filamento padrão" : "Filamento do estoque"} className="sm:col-span-2" hint={temVariacoes ? "Cada variação tem o seu filamento (no quadro Variações)." : fil ? `${(fil.saldoG / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg em estoque · ${formatBRL(fil.custoKg)}/kg` : "Escolha para baixar na produção e usar o custo médio."}>
              <Select
                name="filamentoId"
                value={filamentoId}
                onChange={(e) => {
                  setFilamentoId(e.target.value);
                  const f = filamentos.find((x) => String(x.id) === e.target.value);
                  if (f) {
                    setMaterial(MATERIAIS.includes(f.material) ? f.material : "Outro");
                    setCor(f.cor);
                  }
                }}
              >
                <option value="">Nenhum</option>
                {filamentos.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.material} {f.cor}
                    {f.marca ? ` (${f.marca})` : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Material">
              <Select name="material" value={material} onChange={(e) => setMaterial(e.target.value)}>
                {MATERIAIS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </Select>
            </Field>
            <Field label="Cor">
              <Input name="cor" value={cor} onChange={(e) => setCor(e.target.value)} />
            </Field>
            <Field label="Filamento (g)">
              <Input name="filamentoG" type="number" min={0} value={filamentoG} onChange={(e) => setFilamentoG(Number(e.target.value))} />
            </Field>
            <Field label="Tempo (min)">
              <Input name="tempoImpressaoMin" type="number" min={0} value={tempoMin} onChange={(e) => setTempoMin(Number(e.target.value))} />
            </Field>
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
          <CardHeader title="Preço e envio" />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Custo (R$)">
              <Input name="custo" inputMode="decimal" value={custo} onChange={(e) => setCusto(e.target.value)} onBlur={() => setCusto(normalizar(custo))} />
            </Field>
            <Field label="Preço de venda (R$)" hint={margemReal !== null ? `Margem bruta (sem taxas): ${margemReal.toFixed(0)}%` : undefined}>
              <Input name="preco" inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value)} onBlur={() => setPreco(normalizar(preco))} required />
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
          preco={parseDecimal(preco)}
          parametros={precos}
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
