"use client";

import { Calculator, Printer } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Alert, Button, Card, CardHeader, Field, Input, Select, Textarea } from "@/components/ui";
import { SubmitButton, useFormAction } from "@/components/ui/client";
import type { Produto } from "@/db/schema";
import { custoImpressao, type ParametrosImpressao } from "@/lib/impressao";
import type { ParametrosPreco } from "@/lib/precificacao";
import { formatBRL, parseDecimal } from "@/lib/utils";
import { salvarProduto } from "./actions";
import { NcmField } from "./ncm-field";
import { ImagensField } from "./imagens-field";
import { PrecosCanal } from "./precos-canal";
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

export function ProdutoForm({ produto, parametros, precos }: { produto?: Produto; parametros: ParametrosImpressao; precos: ParametrosPreco }) {
  const [state, onSubmit, pending] = useFormAction(salvarProduto, null);
  const [filamentoG, setFilamentoG] = useState(produto?.filamentoG ?? 0);
  const [tempoMin, setTempoMin] = useState(produto?.tempoImpressaoMin ?? 0);
  const [custo, setCusto] = useState(fmt(produto?.custo));
  const [preco, setPreco] = useState(fmt(produto?.preco));

  const calc = useMemo(() => custoImpressao(filamentoG, tempoMin, parametros), [filamentoG, tempoMin, parametros]);
  const margemReal = parseDecimal(preco) > 0 && parseDecimal(custo) > 0 ? (parseDecimal(preco) / parseDecimal(custo) - 1) * 100 : null;

  return (
    <form onSubmit={onSubmit} className="grid gap-6 xl:grid-cols-3">
      {produto ? <input type="hidden" name="id" value={produto.id} /> : null}

      <div className="grid gap-6 xl:col-span-2">
        <Card>
          <CardHeader title="Identificação" />
          <div className="grid gap-4 p-5 sm:grid-cols-6">
            <Field label="SKU" className="sm:col-span-2">
              <Input name="sku" defaultValue={produto?.sku} required placeholder="ARV-0001" />
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
            {produto ? (
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
            <Field label="Material">
              <Select name="material" defaultValue={produto?.material || "PLA"}>
                {MATERIAIS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </Select>
            </Field>
            <Field label="Cor">
              <Input name="cor" defaultValue={produto?.cor} />
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
            <Button type="button" variant="outline" size="sm" className="mt-2" disabled={!calc.custo} onClick={() => setCusto(fmt(calc.custo))}>
              <Calculator /> Usar como custo
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader title="Preço e envio" />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Custo (R$)">
              <Input name="custo" inputMode="decimal" value={custo} onChange={(e) => setCusto(e.target.value)} />
            </Field>
            <Field label="Preço de venda (R$)" hint={margemReal !== null ? `Margem bruta (sem taxas): ${margemReal.toFixed(0)}%` : undefined}>
              <Input name="preco" inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value)} required />
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

        <PrecosCanal custo={parseDecimal(custo) || calc.custo} preco={parseDecimal(preco)} parametros={precos} usar={(v) => setPreco(fmt(v))} />

        {state?.erro ? <Alert>{state.erro}</Alert> : null}
        <SubmitButton pending={pending} size="lg" pendingText="Salvando...">
          {produto ? "Salvar alterações" : "Cadastrar produto"}
        </SubmitButton>
      </div>
    </form>
  );
}
