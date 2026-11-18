import "server-only";
import { getSettings, setSetting } from "@/lib/settings";

// Conta Bambu Lab (a mesma do MakerWorld e do Bambu Studio): o MakerWorld só libera o download do 3MF com login.
// A senha não fica guardada: o login devolve uma chave de acesso, que fica criptografada em Configurações.
// Quando a Bambu pede confirmação, ela manda um código por e-mail e o login termina com ele.

const API = process.env.BAMBU_API_URL || "https://api.bambulab.com";
type RespostaLogin = { accessToken?: string; refreshToken?: string; expiresIn?: number; loginType?: string; code?: number; error?: string; message?: string };

async function post(path: string, body: unknown): Promise<RespostaLogin> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);
  if (!res) throw new Error("A Bambu Lab não respondeu. Tente de novo.");
  const t = await res.text();
  try {
    return JSON.parse(t) as RespostaLogin;
  } catch {
    return { error: `resposta inesperada (${res.status})` };
  }
}

async function guardar(email: string, r: RespostaLogin) {
  await setSetting("makerworld.email", email);
  await setSetting("makerworld.token", r.accessToken!);
  await setSetting("makerworld.validade", r.expiresIn ? new Date(Date.now() + r.expiresIn * 1000).toISOString() : "");
}

/** 1º passo: e-mail e senha. Volta "codigo" quando a Bambu mandou um código por e-mail para confirmar. */
export async function entrarBambu(email: string, senha: string): Promise<"ok" | "codigo"> {
  const r = await post("/v1/user-service/user/login", { account: email, password: senha });
  if (r.accessToken) {
    await guardar(email, r);
    return "ok";
  }
  if (r.loginType === "verifyCode") {
    await post("/v1/user-service/user/sendemail/code", { email, type: "codeLogin" });
    return "codigo";
  }
  if (r.loginType === "tfa") throw new Error("Sua conta Bambu usa verificação por aplicativo (2FA): troque para código por e-mail no site da Bambu Lab ou desative o 2FA.");
  throw new Error(r.error === "Incorrect account or password." ? "E-mail ou senha da Bambu Lab incorretos." : `A Bambu Lab recusou o login: ${r.error || r.message || "erro"}`);
}

/** 2º passo (quando pedido): o código que chegou por e-mail. */
export async function confirmarCodigoBambu(email: string, codigo: string) {
  const r = await post("/v1/user-service/user/login", { account: email, code: codigo.trim() });
  if (!r.accessToken) throw new Error(r.error ? `Código recusado: ${r.error}` : "Código recusado. Peça um novo.");
  await guardar(email, r);
}

export async function contaBambu() {
  const s = await getSettings(["makerworld.email", "makerworld.token", "makerworld.validade"]);
  return { email: s["makerworld.email"], conectada: Boolean(s["makerworld.token"]), validade: s["makerworld.validade"] };
}

export async function sairBambu() {
  await setSetting("makerworld.token", "");
  await setSetting("makerworld.validade", "");
}

/** Link de download do 3MF de um perfil (instância) do MakerWorld, com a sua conta. */
export async function linkDownloadMakerWorld(instanciaId: string): Promise<{ nome: string; url: string } | null> {
  const token = (await getSettings(["makerworld.token"]))["makerworld.token"];
  if (!token) return null;
  const res = await fetch(`https://makerworld.com/api/v1/design-service/instance/${encodeURIComponent(instanciaId)}/f3mf?type=download`, {
    headers: { Authorization: `Bearer ${token}`, Cookie: `token=${token}`, Accept: "application/json", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36" },
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);
  if (!res?.ok) return null;
  const j = (await res.json().catch(() => null)) as { name?: string; url?: string } | null;
  return j?.url ? { nome: j.name || `modelo-${instanciaId}.3mf`, url: j.url } : null;
}
