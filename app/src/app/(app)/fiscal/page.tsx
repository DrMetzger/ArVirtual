import { asc, desc } from "drizzle-orm";
import { Pencil, Plus, Scale, Sparkles, Trash2, Wand2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Badge, buttonClass, Card, CardHeader, EmptyState, Input, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { ncms, regrasFiscais } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { isSimples, regraMeiErrada } from "@/lib/fiscal/matriz";
import { corrigirRegrasMei, criarNcm, criarRegrasPadrao, descreverNcmIA, excluirNcm, excluirRegra, salvarNcm } from "./actions";
import { RegraForm } from "./regra-form";
import { LinhaLink } from "@/components/linha-link";

export const metadata: Metadata = { title: "Matriz fiscal" };

const DEST = { qualquer: "Qualquer", contribuinte: "Contribuinte", nao_contribuinte: "Não contribuinte" } as const;
const REGIMES: Record<number, string> = { 1: "Simples Nacional", 2: "Simples (excesso de sublimite)", 3: "Regime Normal", 4: "MEI" };

export default async function FiscalPage({ searchParams }: { searchParams: Promise<{ regra?: string; ncmErro?: string }> }) {
  await requireUser();
  const { regra: regraParam, ncmErro } = await searchParams;
  const [regras, emp, listaNcm] = await Promise.all([
    db.select().from(regrasFiscais).orderBy(desc(regrasFiscais.prioridade), regrasFiscais.nome),
    db.query.empresa.findFirst(),
    db.select().from(ncms).orderBy(desc(ncms.pendente), asc(ncms.codigo)),
  ]);
  const editando = regraParam === "nova" ? "nova" : regras.find((r) => String(r.id) === regraParam);
  const regime = emp?.regime ?? 1;
  const meiErradas = regime === 4 ? regras.filter(regraMeiErrada) : [];

  return (
    <>
      <PageHeader
        title="Matriz fiscal"
        description="Define CFOP, CSOSN/CST e alíquotas de cada item da nota a partir do NCM, da UF e do tipo de cliente."
        actions={
          <Link href="/fiscal?regra=nova" className={buttonClass()}>
            <Plus /> Nova regra
          </Link>
        }
      />
      <div className="grid gap-6">
        <Alert tone="blue">
          Empresa no <strong>{REGIMES[regime]}</strong> (UF {emp?.uf ?? "SP"}).{" "}
          {isSimples(regime)
            ? "Os itens usam o CSOSN da regra; ICMS só é destacado com CSOSN 101, 201 ou 900."
            : "Os itens usam o CST de ICMS e as alíquotas da regra."}{" "}
          Confirme as regras com seu contador antes de emitir em produção.{" "}
          <Link href="/configuracoes" className="font-semibold underline">
            Alterar dados da empresa
          </Link>
        </Alert>

        {regime === 4 ? (
          <Alert tone={meiErradas.length ? "red" : "green"}>
            <strong>MEI (CRT 4):</strong> a SEFAZ só aceita venda com <strong>CSOSN 102 e CFOP 5102</strong> (dentro do estado) ou <strong>6102</strong> (fora
            do estado); CSOSN 900 só em CFOPs de devolução/remessa (1202, 2202, 5202, 6202, 5904, 6904...). Na emissão, o sistema já troca o CFOP de venda para
            5102/6102 automaticamente.
            {meiErradas.length ? (
              <form action={corrigirRegrasMei} className="mt-2">
                <span>
                  {meiErradas.length} regra(s) com CFOP/CSOSN inválido para MEI ({meiErradas.map((r) => r.nome).join(", ")}).{" "}
                </span>
                <button type="submit" className={buttonClass("primary", "sm", "mt-2")}>
                  <Wand2 /> Corrigir para 5102/6102 · CSOSN 102
                </button>
              </form>
            ) : null}
          </Alert>
        ) : null}

        {editando ? <RegraForm key={String(regraParam)} regra={editando === "nova" ? undefined : editando} /> : null}

        <Card>
          {regras.length === 0 ? (
            <EmptyState
              icon={<Scale />}
              title="Nenhuma regra fiscal"
              description={
                regime === 4
                  ? "Comece com a regra sugerida para MEI (venda 5102/6102, CSOSN 102) e ajuste com seu contador."
                  : "Comece com as regras sugeridas para Simples Nacional (venda de produção própria, CSOSN 102) e ajuste com seu contador."
              }
              action={
                <form action={criarRegrasPadrao}>
                  <button type="submit" className={buttonClass("gold")}>
                    <Wand2 /> Criar regras sugeridas
                  </button>
                </form>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Regra</th>
                    <th>Aplica em</th>
                    <th>CFOP</th>
                    <th>ICMS</th>
                    <th>PIS / COFINS</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {regras.map((r) => (
                    <LinhaLink key={r.id} href={`/fiscal?regra=${r.id}`} className={r.ativo ? "" : "opacity-50"}>
                      <td>
                        <p className="font-semibold">{r.nome}</p>
                        <p className="text-xs text-muted">
                          {r.naturezaOperacao} · prioridade {r.prioridade}
                        </p>
                      </td>
                      <td className="text-xs">
                        <div className="flex flex-wrap gap-1">
                          <Badge>{r.ncmPrefixo ? `NCM ${r.ncmPrefixo}*` : "Todo NCM"}</Badge>
                          <Badge>{r.ufDestino || "Toda UF"}</Badge>
                          <Badge tone={r.destinatario === "qualquer" ? "neutral" : "blue"}>{DEST[r.destinatario]}</Badge>
                        </div>
                      </td>
                      <td className="font-mono text-xs">
                        {r.cfopInterno} / {r.cfopInterestadual}
                      </td>
                      <td className="text-xs">
                        {isSimples(regime) ? `CSOSN ${r.csosn || "—"}` : `CST ${r.cstIcms || "—"}`}
                        {r.aliqIcms ? ` · ${r.aliqIcms}%` : ""}
                      </td>
                      <td className="text-xs">
                        {r.cstPis} ({r.aliqPis}%) / {r.cstCofins} ({r.aliqCofins}%)
                      </td>
                      <td>
                        <div className="flex justify-end gap-1">
                          <Link href={`/fiscal?regra=${r.id}`} className={buttonClass("ghost", "icon")} title="Editar">
                            <Pencil />
                          </Link>
                          <form action={excluirRegra.bind(null, r.id)}>
                            <button type="submit" className={buttonClass("ghost", "icon", "hover:text-red")} title="Excluir">
                              <Trash2 />
                            </button>
                          </form>
                        </div>
                      </td>
                    </LinhaLink>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card>
          <CardHeader
            title="NCMs"
            description="Criados automaticamente ao salvar produtos ou manualmente abaixo; sem descrição, a IA completa a descrição oficial e o IPI da TIPI."
          />
          <form action={criarNcm} className="grid gap-2 border-b border-border p-5 sm:grid-cols-[130px_1fr_90px_110px_auto] sm:items-end">
            <label className="grid gap-1 text-xs font-semibold text-muted uppercase">
              Novo NCM
              <Input name="codigo" required inputMode="numeric" maxLength={10} placeholder="39264000" className="h-9 font-mono" />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-muted uppercase">
              Descrição
              <Input name="descricao" placeholder="Vazio = a IA preenche" className="h-9" />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-muted uppercase">
              IPI %
              <Input name="aliquotaIpi" inputMode="decimal" className="h-9" />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-muted uppercase">
              Tributos %
              <Input name="aliquotaAproximada" inputMode="decimal" className="h-9" />
            </label>
            <button type="submit" className={buttonClass("gold", "md", "h-9")}>
              <Plus /> Adicionar
            </button>
          </form>
          {ncmErro ? (
            <div className="px-5 pt-4">
              <Alert>{ncmErro}</Alert>
            </div>
          ) : null}
          {listaNcm.length === 0 ? (
            <p className="p-5 text-sm text-muted">Nenhum NCM ainda: adicione acima ou cadastre produtos.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>NCM</th>
                    <th>Descrição</th>
                    <th>IPI %</th>
                    <th>Tributos aprox. %</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {listaNcm.map((n) => (
                    <tr key={n.codigo}>
                      <td className="font-mono text-xs">{n.codigo}</td>
                      <td colSpan={3}>
                        <form action={salvarNcm.bind(null, n.codigo)} className="grid gap-2 sm:grid-cols-[1fr_90px_110px_auto] sm:items-center">
                          <Input name="descricao" defaultValue={n.pendente ? "" : n.descricao} placeholder={n.descricao} className="h-9" />
                          <Input name="aliquotaIpi" inputMode="decimal" defaultValue={n.aliquotaIpi ?? ""} className="h-9" />
                          <Input name="aliquotaAproximada" inputMode="decimal" defaultValue={n.aliquotaAproximada ?? ""} className="h-9" />
                          <button type="submit" className={buttonClass("ghost", "sm")}>
                            Salvar
                          </button>
                        </form>
                      </td>
                      <td className="whitespace-nowrap text-right">
                        {n.pendente ? <Badge tone="gold">pendente</Badge> : <Badge>{n.fonte === "ia" ? "IA" : n.fonte}</Badge>}
                        <form action={descreverNcmIA.bind(null, n.codigo)} className="ml-1 inline">
                          <button type="submit" className={buttonClass("ghost", "icon")} title="Buscar descrição com IA">
                            <Sparkles className="text-gold" />
                          </button>
                        </form>
                        <form action={excluirNcm.bind(null, n.codigo)} className="inline">
                          <button type="submit" className={buttonClass("ghost", "icon", "hover:text-red")} title="Excluir NCM">
                            <Trash2 />
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
