import { asc, desc } from "drizzle-orm";
import { Pencil, Plus, Scale, Sparkles, Trash2, Wand2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Badge, buttonClass, Card, CardHeader, EmptyState, Input, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { ncms, regrasFiscais } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { isSimples } from "@/lib/fiscal/matriz";
import { criarRegrasPadrao, descreverNcmIA, excluirRegra, salvarNcm } from "./actions";
import { RegraForm } from "./regra-form";

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

        {editando ? <RegraForm key={String(regraParam)} regra={editando === "nova" ? undefined : editando} /> : null}

        <Card>
          {regras.length === 0 ? (
            <EmptyState
              icon={<Scale />}
              title="Nenhuma regra fiscal"
              description="Comece com as regras sugeridas para Simples Nacional (venda de produção própria, CSOSN 102) e ajuste com seu contador."
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
                    <tr key={r.id} className={r.ativo ? "" : "opacity-50"}>
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card>
          <CardHeader
            title="NCMs"
            description="Criados automaticamente ao salvar produtos; a IA completa a descrição oficial e o IPI da TIPI."
          />
          {ncmErro ? (
            <div className="px-5 pt-4">
              <Alert>{ncmErro}</Alert>
            </div>
          ) : null}
          {listaNcm.length === 0 ? (
            <p className="p-5 text-sm text-muted">Nenhum NCM ainda: eles aparecem quando você cadastra produtos.</p>
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
