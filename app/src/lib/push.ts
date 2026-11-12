import "server-only";
import { createSign } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { aparelhos } from "@/db/schema";
import { avisosPedidos, pedidosNovos } from "@/lib/aparelhos-pedidos";
import { getSettings } from "@/lib/settings";

/**
 * Notificação push (Firebase Cloud Messaging, grátis): o pedido entra no ERP e o servidor avisa o celular na hora,
 * mesmo com o app fechado e o Android em economia de bateria (a consulta de 15 em 15 min o Android congela).
 */

type ContaServico = { project_id: string; client_email: string; private_key: string };

/** Dados públicos do app no Firebase (do google-services.json) para o celular se registrar. */
export async function configPushApp() {
  const { "push.googleServices": txt } = await getSettings(["push.googleServices"]);
  try {
    const g = JSON.parse(txt) as {
      project_info?: { project_number?: string; project_id?: string };
      client?: { client_info?: { mobilesdk_app_id?: string; android_client_info?: { package_name?: string } }; api_key?: { current_key?: string }[] }[];
    };
    const c = g.client?.find((x) => x.client_info?.android_client_info?.package_name === "br.com.arvirtual.app") ?? g.client?.[0];
    const cfg = { projectId: g.project_info?.project_id ?? "", senderId: g.project_info?.project_number ?? "", appId: c?.client_info?.mobilesdk_app_id ?? "", apiKey: c?.api_key?.[0]?.current_key ?? "" };
    return Object.values(cfg).every(Boolean) ? cfg : null;
  } catch {
    return null;
  }
}

async function contaServico(): Promise<ContaServico | null> {
  const { "push.contaServico": txt } = await getSettings(["push.contaServico"]);
  try {
    const c = JSON.parse(txt) as ContaServico;
    return c.project_id && c.client_email && c.private_key ? c : null;
  } catch {
    return null;
  }
}

// Token de acesso do Google (OAuth com a conta de serviço, JWT assinado RS256), guardado até perto de vencer.
let acesso: { token: string; ate: number } | null = null;
async function tokenGoogle(c: ContaServico) {
  if (acesso && acesso.ate > Date.now()) return acesso.token;
  const agora = Math.floor(Date.now() / 1000);
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const corpo = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iss: c.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat: agora, exp: agora + 3600 })}`;
  const assinatura = createSign("RSA-SHA256").update(corpo).sign(c.private_key.replace(/\\n/g, "\n"), "base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${corpo}.${assinatura}` }),
    signal: AbortSignal.timeout(20_000),
  });
  const j = (await res.json()) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!j.access_token) throw new Error(`Firebase: ${j.error_description ?? res.status}`);
  acesso = { token: j.access_token, ate: Date.now() + ((j.expires_in ?? 3600) - 300) * 1000 };
  return acesso.token;
}

/** Envia um aviso para todos os celulares liberados com push. Token que o Firebase diz que não vale mais é apagado. */
export async function enviarPush(aviso: { id: string; titulo: string; texto: string; link: string }) {
  const c = await contaServico();
  if (!c) return 0;
  const lista = await db.select({ id: aparelhos.id, token: aparelhos.pushToken }).from(aparelhos).where(and(eq(aparelhos.bloqueado, false), ne(aparelhos.pushToken, "")));
  if (!lista.length) return 0;
  const token = await tokenGoogle(c);
  let enviados = 0;
  for (const a of lista) {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${c.project_id}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      // Só "data" + prioridade alta: acorda o celular e o próprio app monta a notificação (ícone e som do ArVirtual).
      body: JSON.stringify({ message: { token: a.token, data: aviso, android: { priority: "high", ttl: "86400s" } } }),
      signal: AbortSignal.timeout(20_000),
    }).catch(() => null);
    if (res?.ok) enviados++;
    else if (res && [400, 404].includes(res.status)) {
      const erro = await res.text();
      if (/UNREGISTERED|INVALID_ARGUMENT|registration-token-not-registered/i.test(erro)) await db.update(aparelhos).set({ pushToken: "" }).where(eq(aparelhos.id, a.id));
    }
  }
  return enviados;
}

// Pedidos já avisados (por id) e desde quando procurar: começa na subida do servidor (não avisa histórico).
const avisados = new Set<number>();
let desde = new Date();

/** Depois de cada sincronização: pedido que acabou de entrar vira push na hora. */
export async function avisarPedidosNovos() {
  const novos = await pedidosNovos(desde);
  const inicio = new Date();
  // Celulares conectados ao ERP (sem Firebase) recebem na hora.
  if (novos.length) avisosPedidos.emit("novos");
  for (const p of novos.reverse()) {
    if (avisados.has(p.id)) continue;
    avisados.add(p.id);
    await enviarPush({ id: String(p.id), titulo: p.titulo, texto: p.texto, link: p.link }).catch((e: Error) => console.warn(`[push] ${e.message}`));
  }
  // Janela com folga de 1 min (pedido gravado durante a consulta não escapa; o Set evita repetir).
  desde = new Date(inicio.getTime() - 60_000);
  if (avisados.size > 5000) avisados.clear();
}
