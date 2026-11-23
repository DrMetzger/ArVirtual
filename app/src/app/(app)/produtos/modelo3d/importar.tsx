"use client";

import { AlertTriangle, Check, CircleHelp, ExternalLink, FileUp, Link2, Search, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { MarcaIcone } from "@/components/marca";
import { Alert, Badge, Button, Card, CardHeader, Field, Input, Select } from "@/components/ui";
import { SubmitButton, useFormAction } from "@/components/ui/client";
import { FotoAmpliavel } from "@/components/foto-ampliavel";
import { custoComposicao, type ParametrosImpressao } from "@/lib/impressao";
import type { FilamentoModelo, Modelo3d, Perfil } from "@/lib/modelos3d";
import { precosPorCanal, type ParametrosPreco } from "@/lib/precificacao";
import { maisParecido, tempoPeloPeso } from "@/lib/cores-filamento";
import { cn, formatBRL } from "@/lib/utils";
import { cadastrarModelo, lerModelo } from "./actions";
import { NOMES_FONTE } from "@/db/schema";

type Filamento = { id: number; material: string; cor: string; marca: string; custoKg: number; saldoG: number; corHex: string };
type Linha = { cor: string; tipo: string; filamentoId: number | null; gramas: number };

const FONTES = NOMES_FONTE;
const NOMES_CANAL: Record<string, string> = { mercadolivre: "Mercado Livre", shopee: "Shopee", magalu: "Magalu", loja: "Sincrolab (loja)" };

function linhasDo(perfil: Perfil | null, modelo: Modelo3d, fils: Filamento[]): Linha[] {
  if (perfil?.filamentos.length) return perfil.filamentos.map((f) => ({ cor: f.cor, tipo: f.tipo, gramas: f.gramas, filamentoId: maisParecido(f, fils) }));
  const base = { cor: "#888888", tipo: "PLA", gramas: modelo.pesoEstimadoG ?? 0 };
  return [{ ...base, filamentoId: maisParecido(base, fils) }];
}

const horas = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min` : `${min} min`);

export function ImportarModelo({
  impressoras,
  filamentos,
  parametros,
  precos,
  linkInicial = "",
}: {
  impressoras: { id: number; nome: string; potenciaW: number }[];
  filamentos: Filamento[];
  parametros: ParametrosImpressao;
  precos: ParametrosPreco;
  linkInicial?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  // Veio do Plano da IA com o link: já lê o modelo sozinho.
  useEffect(() => {
    if (linkInicial) formRef.current?.requestSubmit();
  }, [linkInicial]);
  const router = useRouter();
  const [leitura, onSubmit, lendo] = useFormAction(lerModelo, null);
  const [modo, setModo] = useState<"link" | "arquivo">("link");
  const m = leitura?.modelo;
  const [perfilId, setPerfilId] = useState<string | null>(null);
  const perfil = m?.perfis.find((p) => p.id === perfilId) ?? null;
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [tempoMin, setTempoMin] = useState(0);
  const [licenca, setLicenca] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();

  // Modelo novo: primeiro perfil (o do link, se veio); perfil novo: cores, gramas e tempo dele.
  useEffect(() => {
    setPerfilId(m?.perfis[0]?.id ?? null);
    setLicenca(false);
    setMsg(null);
  }, [m]);
  useEffect(() => {
    if (!m) return;
    setLinhas(linhasDo(perfil, m, filamentos));
    // Sem tempo informado: estimativa de ~4 min por grama (bico 0,4, camada 0,2), marcada na tela.
    setTempoMin(perfil?.tempoMin || tempoPeloPeso(perfil?.pesoG || m.pesoEstimadoG || 0));
  }, [m, perfil, filamentos]);

  const encaixes = m ? (leitura?.encaixes?.[perfilId ?? "base"] ?? []) : [];
  const primeira = encaixes.find((e) => e.cabe !== false);
  const custo = useMemo(() => {
    const pot = impressoras.find((i) => i.id === primeira?.impressoraId)?.potenciaW ?? parametros.potenciaW;
    return custoComposicao(
      linhas.map((l) => ({ filamentoId: l.filamentoId, gramas: l.gramas })),
      tempoMin,
      { ...parametros, potenciaW: pot },
      filamentos,
    );
  }, [linhas, tempoMin, parametros, filamentos, impressoras, primeira]);
  const canais = custo.custo > 0 ? precosPorCanal(custo.custo, 0, precos).filter((c) => c.sugerido > 0) : [];
  const marketplaces = canais.filter((c) => c.canal !== "loja").sort((a, b) => a.sugerido - b.sugerido);

  const cadastrar = () =>
    iniciar(async () => {
      setMsg(null);
      const r = await cadastrarModelo({ token: leitura!.token!, perfilId, cores: linhas.map((l) => ({ filamentoId: l.filamentoId, gramas: l.gramas })), tempoMin, licencaPropria: licenca });
      if (r.erro) setMsg(r.erro);
      else router.push(`/produtos/${r.id}`);
    });

  return (
    <div className="grid gap-5">
      <Alert tone="blue">
        Para procurar o produto em 4 sites de modelos 3D ao mesmo tempo, ver o mercado de cada um e cadastrar todos de uma vez, use{" "}
        <a href="/modelos3d" className="font-semibold underline">
          Modelos 3D
        </a>{" "}
        no menu.
      </Alert>

      <Card>
        <div className="flex flex-wrap gap-1 border-b border-border p-2">
          {(
            [
              ["link", Link2, "Colar link"],
              ["arquivo", FileUp, "Enviar arquivo (.3mf / .stl)"],
            ] as const
          ).map(([v, Icone, rot]) => (
            <button
              key={v}
              type="button"
              onClick={() => setModo(v)}
              className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold", modo === v ? "bg-primary text-primary-fg" : "text-muted hover:text-foreground")}
            >
              <Icone className="size-4" /> {rot}
            </button>
          ))}
        </div>
        <form ref={formRef} onSubmit={onSubmit} className="grid gap-3 p-5">
          {modo === "link" ? (
            <Field label="Link do modelo" hint="MakerWorld, Printables, Cults3D ou MyMiniFactory">
              <Input name="link" required defaultValue={linkInicial} placeholder="https://makerworld.com/pt/models/..." />
            </Field>
          ) : (
            <>
              <Field label="Arquivo" hint="Melhor: o 3MF fatiado do Bambu Studio (Arquivo › Exportar › Arquivo fatiado) — traz tempo, gramas e cores exatos.">
                <input
                  type="file"
                  name="arquivo"
                  required
                  accept=".3mf,.stl"
                  className="w-full min-w-0 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:text-sm file:font-semibold"
                />
              </Field>
              <Field label="Link de onde baixou (opcional)" hint="Guardado no produto para lembrar a origem e a licença.">
                <Input name="link" placeholder="https://makerworld.com/pt/models/..." />
              </Field>
            </>
          )}
          <SubmitButton pending={lendo} pendingText="Lendo o modelo (medindo os arquivos)..." className="justify-self-start">
            <Search /> Ler modelo
          </SubmitButton>
          {leitura?.erro ? <Alert>{leitura.erro}</Alert> : null}
        </form>
      </Card>

      {m ? (
        <>
          <Card>
            <div className="grid gap-5 p-5 md:grid-cols-[minmax(0,16rem)_1fr]">
              <div className="grid content-start gap-2">
                {m.fotos[0] ? (
                  <FotoAmpliavel src={m.fotos[0]} className="aspect-square w-full rounded-xl bg-surface-2 object-contain" />
                ) : (
                  <div className="grid aspect-square place-items-center rounded-xl bg-surface-2 text-xs text-muted">sem foto</div>
                )}
                {m.fotos.length > 1 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {m.fotos.slice(1, 9).map((f) => (
                      <FotoAmpliavel key={f} src={f} className="size-12 rounded-lg bg-surface-2 object-cover" />
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="grid min-w-0 content-start gap-3">
                <div>
                  <p className="text-xs font-semibold tracking-wide text-muted uppercase">{FONTES[m.fonte]}</p>
                  <h2 className="text-xl font-extrabold">{m.titulo}</h2>
                  <p className="text-sm text-muted">
                    {m.autor ? `por ${m.autor}` : ""}
                    {m.link ? (
                      <a href={m.link} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 text-gold hover:underline">
                        abrir <ExternalLink className="size-3.5" />
                      </a>
                    ) : null}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge tone={m.comercial === true ? "green" : m.comercial === false ? "red" : "neutral"}>
                    {m.comercial === true ? "Pode vender" : m.comercial === false ? "Não comercial" : "Licença: conferir"}
                    {m.licenca ? ` · ${m.licenca}` : ""}
                  </Badge>
                  {m.medidasMm ? <Badge tone="blue">{m.medidasMm.map((v) => Math.round(v)).join(" × ")} mm</Badge> : null}
                  {m.pesoEstimadoG && !perfil?.pesoG ? <Badge>~{m.pesoEstimadoG} g (estimado)</Badge> : null}
                </div>
                {m.comercial === false ? (
                  <Alert>
                    <span className="grid gap-2">
                      <span>
                        Licença não comercial: o produto pode ser cadastrado, mas o anúncio fica bloqueado até você confirmar que comprou a licença comercial do
                        autor (dá para confirmar depois, na página do produto).
                      </span>
                      <label className="inline-flex items-center gap-2 font-semibold">
                        <input type="checkbox" checked={licenca} onChange={(e) => setLicenca(e.target.checked)} className="size-4 accent-[var(--gold)]" />
                        Já tenho a licença comercial deste modelo
                      </label>
                    </span>
                  </Alert>
                ) : m.comercial === null ? (
                  <Alert tone="gold">Não identifiquei a licença: confira no site se o autor permite vender as impressões antes de anunciar.</Alert>
                ) : m.licenca.includes("BY") ? (
                  <p className="text-xs text-muted">A licença pede crédito ao autor: o nome dele fica guardado no produto.</p>
                ) : null}
                {leitura?.jaCadastrado ? (
                  <Alert tone="blue">
                    Este modelo já está cadastrado:{" "}
                    <a href={`/produtos/${leitura.jaCadastrado.id}`} className="font-semibold underline">
                      {leitura.jaCadastrado.nome}
                    </a>
                    . Não vou criar outro igual.
                  </Alert>
                ) : null}
                {m.avisos.map((a) => (
                  <p key={a} className="inline-flex items-start gap-1.5 text-xs text-muted">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-gold" /> {a}
                  </p>
                ))}
              </div>
            </div>
          </Card>

          {m.perfis.length > 1 ? (
            <Card>
              <CardHeader title={`Perfis de impressão (${m.perfis.length})`} description="Cada perfil tem as suas cores, peso e tempo. Escolha o que você vai imprimir." />
              <div className="grid gap-2 p-5 pt-0 sm:grid-cols-2">
                {m.perfis.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPerfilId(p.id)}
                    className={cn("grid gap-1 rounded-xl border p-3 text-left text-sm", perfilId === p.id ? "border-gold bg-gold/10" : "border-border hover:border-gold/60")}
                  >
                    <span className="font-semibold">{p.titulo}</span>
                    <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
                      {horas(p.tempoMin)} · {p.pesoG} g
                      {p.filamentos.map((f, i) => (
                        <span key={i} title={`${f.tipo} ${f.cor}`} className="inline-block size-3.5 rounded-full ring-1 ring-black/20" style={{ background: f.cor }} />
                      ))}
                    </span>
                  </button>
                ))}
              </div>
            </Card>
          ) : null}

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title="Em qual impressora cabe" description="Pelo tamanho da peça, pelas cores de uma vez e pela compatibilidade do perfil." />
              <ul className="divide-y divide-border">
                {encaixes.map((e) => (
                  <li key={e.impressoraId} className="flex items-start gap-3 px-5 py-3 text-sm">
                    {e.cabe === true ? (
                      <Check className="mt-0.5 size-4 shrink-0 text-green" />
                    ) : e.cabe === false ? (
                      <X className="mt-0.5 size-4 shrink-0 text-red" />
                    ) : (
                      <CircleHelp className="mt-0.5 size-4 shrink-0 text-gold" />
                    )}
                    <span className="min-w-0">
                      <span className="font-semibold">{e.nome}</span>
                      <span className="block text-xs text-muted">{e.motivo}</span>
                    </span>
                  </li>
                ))}
                {!encaixes.length ? <li className="px-5 py-3 text-sm text-muted">Cadastre as impressoras em Configurações › Impressora 3D.</li> : null}
              </ul>
            </Card>

            <Card>
              <CardHeader title="Cores → seus filamentos" description="Cada cor do modelo já ligada ao filamento do estoque mais parecido. Troque se quiser." />
              <div className="grid gap-3 p-5 pt-0">
                {linhas.map((l, i) => (
                  <div key={i} className="grid grid-cols-[auto_minmax(0,1fr)_5.5rem] items-center gap-2">
                    <span title={`${l.tipo} ${l.cor}`} className="size-7 rounded-full ring-1 ring-black/20" style={{ background: l.cor }} />
                    <Select
                      aria-label={`Filamento da cor ${i + 1}`}
                      value={l.filamentoId ?? ""}
                      onChange={(ev) => setLinhas(linhas.map((x, k) => (k === i ? { ...x, filamentoId: Number(ev.target.value) || null } : x)))}
                    >
                      <option value="">Filamento padrão</option>
                      {filamentos.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.material} {f.cor}
                          {f.marca ? ` (${f.marca})` : ""} · {f.saldoG} g
                        </option>
                      ))}
                    </Select>
                    <div className="relative">
                      <Input
                        aria-label={`Gramas da cor ${i + 1}`}
                        inputMode="decimal"
                        value={String(l.gramas)}
                        onChange={(ev) => setLinhas(linhas.map((x, k) => (k === i ? { ...x, gramas: Number(ev.target.value.replace(",", ".")) || 0 } : x)))}
                        className="pr-6 text-right"
                      />
                      <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-muted">g</span>
                    </div>
                  </div>
                ))}
                <Field label="Tempo de impressão (min)" hint={tempoMin ? `${horas(tempoMin)}${perfil?.tempoMin ? "" : " (estimado pelo peso: confira no fatiador)"}` : "Sem o tempo, o custo de energia fica de fora."}>
                  <Input inputMode="numeric" value={String(tempoMin)} onChange={(ev) => setTempoMin(Number(ev.target.value) || 0)} />
                </Field>
              </div>
            </Card>
          </div>

          <Card>
            <CardHeader
              title={`Custo da peça: ${formatBRL(custo.custo)}`}
              description={`Filamento ${formatBRL(custo.material)} + energia ${formatBRL(custo.energia)}. Preço sugerido de cada plataforma com ${precos.margem}% de lucro depois das taxas.`}
            />
            {canais.length ? (
              <div className="grid gap-3 p-5 pt-0 sm:grid-cols-2 lg:grid-cols-4">
                {canais.map((c) => (
                  <div key={c.canal} className={cn("grid gap-1 rounded-xl border p-3", marketplaces[0]?.canal === c.canal ? "border-green" : "border-border")}>
                    <span className="inline-flex items-center gap-2 text-sm font-semibold">
                      <MarcaIcone canal={c.canal} /> {NOMES_CANAL[c.canal] ?? c.canal}
                    </span>
                    <span className="text-lg font-extrabold">{formatBRL(c.sugerido)}</span>
                    <span className="text-xs text-muted">mínimo {formatBRL(c.minimo)}</span>
                    {marketplaces[0]?.canal === c.canal ? <Badge tone="green">Mais competitivo</Badge> : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="p-5 pt-0 text-sm text-muted">Informe gramas (e tempo) para calcular.</p>
            )}
          </Card>

          <div className="grid gap-2">
            {msg ? <Alert>{msg}</Alert> : null}
            <Button type="button" variant="gold" size="lg" disabled={salvando || Boolean(leitura?.jaCadastrado)} onClick={cadastrar} className="justify-self-start">
              <Sparkles /> {salvando ? "Cadastrando (fotos, descrição, NCM e categoria)..." : "Cadastrar produto no site"}
            </Button>
            <p className="text-xs text-muted">Depois, no produto, você escolhe em quais plataformas anunciar (os preços de cada uma já vão preenchidos).</p>
          </div>
        </>
      ) : null}
    </div>
  );
}
