import { desc } from "drizzle-orm";
import { BatteryCharging, BatteryFull, BatteryLow, BatteryMedium, MapPin, ShieldBan, ShieldCheck, Smartphone, Trash2 } from "lucide-react";
import { Alert, Badge, buttonClass, Card, CardHeader, EmptyState } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { db } from "@/db";
import { aparelhos } from "@/db/schema";
import { cn, formatDate } from "@/lib/utils";
import { bloquearAparelho, removerAparelho } from "./actions";

const ha = (d: Date) => {
  const min = Math.round((Date.now() - d.getTime()) / 60_000);
  if (min < 2) return "agora";
  if (min < 60) return `há ${min} min`;
  if (min < 48 * 60) return `há ${Math.round(min / 60)} h`;
  return formatDate(d);
};

function Bateria({ nivel, carregando }: { nivel: number | null; carregando: boolean }) {
  if (nivel === null) return <span className="text-muted">—</span>;
  const Icone = carregando ? BatteryCharging : nivel > 60 ? BatteryFull : nivel > 20 ? BatteryMedium : BatteryLow;
  return (
    <span className={cn("inline-flex items-center gap-1 font-semibold", nivel <= 20 && !carregando ? "text-red" : carregando ? "text-green" : "")}>
      <Icone className="size-4" /> {nivel}%{carregando ? " · carregando" : ""}
    </span>
  );
}

/** Configurações › Aparelhos: celulares com o app, onde estão, bateria, e bloquear/liberar o acesso. */
export async function AparelhosAba({ admin }: { admin: boolean }) {
  const lista = await db.select().from(aparelhos).orderBy(desc(aparelhos.ultimoAcesso));
  return (
    <Card>
      <CardHeader
        title="Aparelhos conectados"
        description="Celulares e tablets com o app ArVirtual. A localização e a bateria são atualizadas quando o app é aberto e a cada ~15 minutos."
      />
      {!admin ? (
        <div className="p-5">
          <Alert tone="gold">Só administradores podem bloquear ou liberar aparelhos.</Alert>
        </div>
      ) : null}
      {lista.length === 0 ? (
        <EmptyState icon={<Smartphone />} title="Nenhum aparelho ainda" description="Instale o app Android (botão no login ou no menu) e entre com seu usuário: o aparelho aparece aqui." />
      ) : (
        <div className="divide-y divide-border">
          {lista.map((a) => {
            const mapa = a.latitude !== null && a.longitude !== null ? `https://www.google.com/maps?q=${a.latitude},${a.longitude}` : null;
            return (
              <div key={a.id} className={cn("grid gap-3 p-4 sm:p-5 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] md:items-center", a.bloqueado && "bg-red/5")}>
                <div className="flex min-w-0 items-start gap-3">
                  <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl", a.bloqueado ? "bg-red/12 text-red" : "bg-primary/12 text-primary")}>
                    <Smartphone className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {[a.fabricante, a.modelo].filter(Boolean).join(" ") || "Aparelho Android"}{" "}
                      {a.bloqueado ? <Badge tone="red">Bloqueado</Badge> : <Badge tone="green">Liberado</Badge>}
                    </p>
                    <p className="text-sm text-muted">
                      {a.usuarioNome || "Sem usuário"} · Android {a.android || "?"} · app {a.versaoApp || "?"}
                    </p>
                    <p className="text-xs text-muted">
                      Último acesso {ha(a.ultimoAcesso)}
                      {a.ip ? ` · IP ${a.ip}` : ""}
                      {a.notificacoes ? " · notificações ligadas" : " · notificações desligadas"}
                    </p>
                    {a.bloqueado && a.bloqueadoEm ? (
                      <p className="text-xs text-red">
                        Bloqueado {formatDate(a.bloqueadoEm)}
                        {a.bloqueadoPor ? ` por ${a.bloqueadoPor}` : ""}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="grid gap-1 text-sm">
                  <Bateria nivel={a.bateria} carregando={a.carregando} />
                  {mapa ? (
                    <a href={mapa} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-gold hover:underline">
                      <MapPin className="size-4" /> Ver no mapa
                      <span className="text-xs text-muted">
                        {a.localizadoEm ? ha(a.localizadoEm) : ""}
                        {a.precisaoM ? ` · ±${a.precisaoM} m` : ""}
                      </span>
                    </a>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-muted">
                      <MapPin className="size-4" /> Localização não permitida no aparelho
                    </span>
                  )}
                </div>
                {admin ? (
                  <div className="flex flex-wrap gap-2 md:justify-end">
                    <form action={bloquearAparelho.bind(null, a.id, !a.bloqueado)}>
                      <SubmitButton variant={a.bloqueado ? "primary" : "outline"} size="sm" pendingText="Salvando..." className={a.bloqueado ? "" : "hover:border-red hover:text-red"}>
                        {a.bloqueado ? (
                          <>
                            <ShieldCheck /> Desbloquear
                          </>
                        ) : (
                          <>
                            <ShieldBan /> Bloquear
                          </>
                        )}
                      </SubmitButton>
                    </form>
                    {!a.bloqueado ? (
                      <form action={removerAparelho.bind(null, a.id)}>
                        <button type="submit" className={buttonClass("ghost", "sm", "hover:text-red")} title="Tirar da lista">
                          <Trash2 />
                        </button>
                      </form>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
