"use client";

import { CheckCircle2, ExternalLink, Loader2, Megaphone, Sparkles, XCircle } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Alert, Button, buttonClass, Card, CardHeader, Field, Input, Select, Textarea } from "@/components/ui";
import type { Marketplace } from "@/db/schema";
import { formatValor, parseDecimal } from "@/lib/utils";
import { gerarAnuncioIA, type ResultadoPublicacao } from "./actions";

type Conta = { id: number; nome: string; marketplace: Marketplace; marketplaceNome: string; cor: string };

export function Anunciar({
  produtoId,
  nome,
  descricao,
  preco,
  precosCanal = {},
  contas,
  temImagem,
  iaConfigurada,
  ml = { tipo: "classico", frete: "automatico" },
}: {
  produtoId: string;
  nome: string;
  descricao: string;
  preco: number;
  precosCanal?: Partial<Record<"mercadolivre" | "shopee" | "magalu" | "loja", number>>;
  contas: Conta[];
  temImagem: boolean;
  iaConfigurada: boolean;
  /** Padrões de Configurações › Precificação: Mercado Livre. */
  ml?: { tipo: string; frete: string };
}) {
  const [titulo, setTitulo] = useState(nome.slice(0, 60));
  const [texto, setTexto] = useState(descricao);
  const [selecionadas, setSelecionadas] = useState<number[]>(contas.map((c) => c.id));
  const [erroIA, setErroIA] = useState("");
  const [resultados, setResultados] = useState<ResultadoPublicacao[] | null>(null);
  const [gerando, startIA] = useTransition();
  const [publicando, startPub] = useTransition();
  const mps = [...new Set(contas.filter((c) => selecionadas.includes(c.id)).map((c) => c.marketplace))];

  return (
    <Card>
      <CardHeader
        title="Anunciar nos marketplaces"
        description="Publica este produto do catálogo nas contas conectadas."
        action={<Megaphone className="size-5 text-gold" />}
      />
      {contas.length === 0 ? (
        <div className="grid gap-3 p-5 text-sm text-muted">
          Nenhuma conta conectada.
          <Link href="/marketplaces" className={buttonClass("gold", "sm", "w-fit")}>
            Conectar marketplaces
          </Link>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            setResultados(null);
            startPub(async () => {
              try {
                const res = await fetch(`/api/produtos/${produtoId}/publicar`, { method: "POST", body: fd });
                const dados = (await res.json().catch(() => null)) as ResultadoPublicacao[] | null;
                setResultados(dados ?? [{ conta: "-", ok: false, mensagem: `Erro ${res.status} ao publicar. Recarregue a página e tente de novo.` }]);
              } catch {
                setResultados([{ conta: "-", ok: false, mensagem: "Sem conexão com o servidor. Verifique a internet e tente de novo." }]);
              }
            });
          }}
          className="grid gap-4 p-5"
        >
          {!temImagem ? <Alert tone="gold">Adicione ao menos uma imagem: os marketplaces exigem foto.</Alert> : null}
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">Conteúdo do anúncio</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!iaConfigurada || gerando}
              title={iaConfigurada ? "" : "Cadastre a chave do Gemini em Configurações"}
              onClick={() =>
                startIA(async () => {
                  setErroIA("");
                  const r = await gerarAnuncioIA(produtoId);
                  if (r.sugestao) {
                    setTitulo(r.sugestao.titulo);
                    setTexto(r.sugestao.descricao);
                  } else setErroIA(r.erro ?? "Falha ao gerar");
                })
              }
            >
              {gerando ? <Loader2 className="animate-spin" /> : <Sparkles className="text-gold" />}
              Gerar com IA
            </Button>
          </div>
          {erroIA ? <Alert>{erroIA}</Alert> : null}
          <Field label={`Título (${titulo.length}/60)`}>
            <Input name="titulo" value={titulo} maxLength={60} onChange={(e) => setTitulo(e.target.value)} />
          </Field>
          <Field label="Descrição">
            <Textarea name="descricao" value={texto} rows={7} onChange={(e) => setTexto(e.target.value)} />
          </Field>
          <Field
            label="Preço no anúncio (R$)"
            hint={`Vazio = preço de cada canal (${Object.entries({ mercadolivre: "ML", shopee: "Shopee", magalu: "Magalu" })
              .map(([k, n]) => `${n} ${formatValor(precosCanal[k as keyof typeof precosCanal] || preco)}`)
              .join(" · ")}).`}
          >
            <Input name="preco" inputMode="decimal" placeholder="preço do canal" onBlur={(e) => e.target.value.trim() && (e.target.value = formatValor(parseDecimal(e.target.value)))} />
          </Field>

          <div className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">Publicar em</span>
            {contas.map((c) => (
              <label key={c.id} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  name="contas"
                  value={c.id}
                  checked={selecionadas.includes(c.id)}
                  onChange={(e) => setSelecionadas(e.target.checked ? [...selecionadas, c.id] : selecionadas.filter((x) => x !== c.id))}
                  className="size-4 accent-[var(--gold)]"
                />
                <span className="size-2.5 rounded-full" style={{ background: c.cor }} />
                <span className="font-semibold">{c.marketplaceNome}</span>
                <span className="text-muted">{c.nome}</span>
              </label>
            ))}
          </div>

          {mps.includes("mercadolivre") ? (
            <div className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-2">
              <Field label="Mercado Livre · tipo de anúncio">
                <Select name="ml_tipo" defaultValue={ml.tipo}>
                  <option value="classico">Clássico</option>
                  <option value="premium">Premium (parcelado sem juros)</option>
                </Select>
              </Field>
              <Field label="Mercado Livre · frete grátis">
                <Select name="ml_frete" defaultValue={ml.frete}>
                  <option value="automatico">Automático (regra do ML: grátis a partir de R$ 79)</option>
                  <option value="sempre">Sempre grátis</option>
                  <option value="nunca">Comprador paga (só abaixo de R$ 79)</option>
                </Select>
              </Field>
            </div>
          ) : null}

          {mps.length ? (
            <details className="rounded-xl border border-border px-3 py-2 text-sm">
              <summary className="cursor-pointer text-muted">Categoria (opcional: sem ela, usamos a sugestão do marketplace)</summary>
              <div className="mt-3 grid gap-3">
                {mps.map((mp) => (
                  <Field key={mp} label={`ID da categoria · ${contas.find((c) => c.marketplace === mp)?.marketplaceNome}`}>
                    <Input name={`categoria_${mp}`} placeholder={mp === "mercadolivre" ? "MLB1234" : "123456"} />
                  </Field>
                ))}
              </div>
            </details>
          ) : null}

          <Button type="submit" variant="gold" size="lg" disabled={publicando || !selecionadas.length}>
            {publicando ? <Loader2 className="animate-spin" /> : <Megaphone />}
            {publicando ? "Publicando..." : "Publicar anúncio"}
          </Button>

          {resultados ? (
            <div className="grid gap-2">
              {resultados.map((r) => (
                <div
                  key={r.conta}
                  className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${r.ok ? "border-green/30 text-green" : "border-red/30 text-red"}`}
                >
                  {r.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <XCircle className="mt-0.5 size-4 shrink-0" />}
                  <div className="min-w-0">
                    <p className="font-semibold">{r.conta}</p>
                    <p className="break-words opacity-90">{r.mensagem}</p>
                    {r.link ? (
                      <a href={r.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
                        Ver anúncio <ExternalLink className="size-3" />
                      </a>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </form>
      )}
    </Card>
  );
}
