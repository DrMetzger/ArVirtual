import "server-only";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { codigosVerificacao, contasEmail, usuarios } from "@/db/schema";
import { enviarEmail } from "./mail";
import { getSetting } from "./settings";

// Verificação em duas etapas por e-mail: código de 6 dígitos, válido por 10 minutos, até 5 tentativas.
// O banco guarda só o HMAC do código.

const VALIDADE_MIN = 10;
const MAX_TENTATIVAS = 5;
const INTERVALO_REENVIO_S = 60;

type Finalidade = "login" | "ativar";
type Usuario = typeof usuarios.$inferSelect;

function hash(usuarioId: string, finalidade: Finalidade, codigo: string) {
  return createHmac("sha256", process.env.AUTH_SECRET ?? "").update(`${usuarioId}:${finalidade}:${codigo}`).digest("hex");
}

export async function exige2fa(user: Pick<Usuario, "doisFatores">) {
  // Válvula de emergência (ex.: SMTP fora do ar): AUTH_2FA_DESATIVADO=1 no .env da VM.
  if (process.env.AUTH_2FA_DESATIVADO === "1") return false;
  return user.doisFatores || (await getSetting("seguranca.exigir2fa")) === "sim";
}

export async function emailConfigurado() {
  return Boolean(await db.query.contasEmail.findFirst({ where: eq(contasEmail.padrao, true) }));
}

/** Gera, guarda e envia um código novo. Os anteriores da mesma finalidade deixam de valer. */
export async function enviarCodigo(user: Pick<Usuario, "id" | "nome" | "email">, finalidade: Finalidade) {
  // Só segura o reenvio se ainda existe um código válido (não usado) mandado há menos de 1 minuto.
  const ultimo = await db.query.codigosVerificacao.findFirst({
    where: and(
      eq(codigosVerificacao.usuarioId, user.id),
      eq(codigosVerificacao.finalidade, finalidade),
      isNull(codigosVerificacao.usadoEm),
      gt(codigosVerificacao.expiraEm, new Date()),
    ),
    orderBy: desc(codigosVerificacao.criadoEm),
  });
  const espera = ultimo ? INTERVALO_REENVIO_S - Math.floor((Date.now() - ultimo.criadoEm.getTime()) / 1000) : 0;
  if (espera > 0) throw new Error(`Aguarde ${espera}s para pedir outro código.`);

  const codigo = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.transaction(async (tx) => {
    await tx
      .update(codigosVerificacao)
      .set({ usadoEm: new Date() })
      .where(and(eq(codigosVerificacao.usuarioId, user.id), eq(codigosVerificacao.finalidade, finalidade), isNull(codigosVerificacao.usadoEm)));
    await tx.insert(codigosVerificacao).values({
      usuarioId: user.id,
      finalidade,
      codigoHash: hash(user.id, finalidade, codigo),
      expiraEm: new Date(Date.now() + VALIDADE_MIN * 60_000),
    });
  });

  const titulo = finalidade === "login" ? "Seu código de acesso" : "Confirme a verificação em duas etapas";
  await enviarEmail({
    para: user.email,
    assunto: `${codigo} é o seu código ArVirtual`,
    html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#10223a">
<div style="background:#0c2748;padding:20px 24px;border-radius:12px 12px 0 0">
<p style="margin:0;color:#fff;font-size:18px;font-weight:800;letter-spacing:1px">ARVIRTUAL</p>
<p style="margin:2px 0 0;color:#e6c158;font-size:11px;letter-spacing:2px">PESQUISA &amp; DESENVOLVIMENTO</p></div>
<div style="border:1px solid #dbe4ef;border-top:0;padding:24px;border-radius:0 0 12px 12px">
<p style="margin-top:0">Olá, ${user.nome.split(" ")[0]}!</p>
<p>${titulo}:</p>
<p style="font-size:34px;font-weight:800;letter-spacing:10px;margin:16px 0;color:#1a5f9e">${codigo}</p>
<p style="color:#5a6b82;font-size:13px">Vale por ${VALIDADE_MIN} minutos. Se não foi você, troque sua senha: alguém pode ter descoberto.</p>
</div></div>`,
  });
}

/** Confere o código. Errar 5 vezes invalida o código (é preciso pedir outro). */
export async function conferirCodigo(usuarioId: string, finalidade: Finalidade, codigoDigitado: string): Promise<{ ok: true } | { ok: false; erro: string }> {
  const codigo = codigoDigitado.replace(/\D/g, "");
  const atual = await db.query.codigosVerificacao.findFirst({
    where: and(
      eq(codigosVerificacao.usuarioId, usuarioId),
      eq(codigosVerificacao.finalidade, finalidade),
      isNull(codigosVerificacao.usadoEm),
      gt(codigosVerificacao.expiraEm, new Date()),
    ),
    orderBy: desc(codigosVerificacao.criadoEm),
  });
  if (!atual) return { ok: false, erro: "Código expirado. Peça um novo." };
  if (atual.tentativas >= MAX_TENTATIVAS) return { ok: false, erro: "Muitas tentativas erradas. Peça um novo código." };

  const esperado = Buffer.from(atual.codigoHash, "hex");
  const recebido = Buffer.from(hash(usuarioId, finalidade, codigo), "hex");
  if (codigo.length !== 6 || !timingSafeEqual(esperado, recebido)) {
    const tentativas = atual.tentativas + 1;
    await db.update(codigosVerificacao).set({ tentativas }).where(eq(codigosVerificacao.id, atual.id));
    const restam = MAX_TENTATIVAS - tentativas;
    return { ok: false, erro: restam > 0 ? `Código incorreto. ${restam} tentativa(s) restante(s).` : "Muitas tentativas erradas. Peça um novo código." };
  }
  await db.update(codigosVerificacao).set({ usadoEm: new Date() }).where(eq(codigosVerificacao.id, atual.id));
  return { ok: true };
}
