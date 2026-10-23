import { jwtVerify, SignJWT } from "jose";

// Usado pelo proxy (edge-safe) e pelo servidor.
export const SESSION_COOKIE = "arv_session";
const MAX_AGE_S = 60 * 60 * 24 * 7;

export type SessionPayload = { sub: string; nome: string; papel: "admin" | "usuario" };

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET ausente ou curta (mínimo 32 caracteres)");
  return new TextEncoder().encode(s);
}

export async function signSession(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_S}s`)
    .sign(secret());
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  // Em produção (APP_URL https://...) o cookie só trafega por HTTPS.
  secure: process.env.APP_URL?.startsWith("https://") ?? false,
  path: "/",
  maxAge: MAX_AGE_S,
};
