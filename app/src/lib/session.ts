import { jwtVerify, SignJWT } from "jose";

// Usado pelo proxy (edge-safe) e pelo servidor.
export const SESSION_COOKIE = "arv_session";
/** Login com senha conferida, esperando o código do e-mail (verificação em duas etapas). */
export const PENDING_2FA_COOKIE = "arv_2fa";
/** Navegador marcado como confiável: pula o código por 30 dias. */
export const TRUSTED_COOKIE = "arv_confiavel";

const MAX_AGE_S = 60 * 60 * 24 * 7;
const PENDING_MAX_AGE_S = 10 * 60;
const TRUSTED_MAX_AGE_S = 60 * 60 * 24 * 30;

export type SessionPayload = { sub: string; nome: string; papel: "admin" | "usuario" };
export type PendingPayload = { sub: string; destino: string };

// Cada tipo de token tem sua "audience": um token de 2FA pendente nunca vale como sessão.
type Aud = "sessao" | "2fa" | "dispositivo";

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET ausente ou curta (mínimo 32 caracteres)");
  return new TextEncoder().encode(s);
}

function sign(payload: Record<string, unknown>, aud: Aud, maxAgeS: number) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime(`${maxAgeS}s`)
    .sign(secret());
}

async function verify<T>(token: string | undefined, aud: Aud): Promise<T | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"], audience: aud });
    return payload as unknown as T;
  } catch {
    return null;
  }
}

export const signSession = (payload: SessionPayload) => sign(payload, "sessao", MAX_AGE_S);
export const verifySession = (token: string | undefined) => verify<SessionPayload>(token, "sessao");

export const signPending = (payload: PendingPayload) => sign(payload, "2fa", PENDING_MAX_AGE_S);
export const verifyPending = (token: string | undefined) => verify<PendingPayload>(token, "2fa");

export const signTrusted = (userId: string) => sign({ sub: userId }, "dispositivo", TRUSTED_MAX_AGE_S);
export const verifyTrusted = (token: string | undefined) => verify<{ sub: string }>(token, "dispositivo");

const secure = process.env.APP_URL?.startsWith("https://") ?? false;

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  // Em produção (APP_URL https://...) o cookie só trafega por HTTPS.
  secure,
  path: "/",
  maxAge: MAX_AGE_S,
};
export const pendingCookieOptions = { ...sessionCookieOptions, sameSite: "strict" as const, maxAge: PENDING_MAX_AGE_S };
export const trustedCookieOptions = { ...sessionCookieOptions, sameSite: "strict" as const, maxAge: TRUSTED_MAX_AGE_S };
