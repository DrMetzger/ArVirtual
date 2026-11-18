import "server-only";

// Proteção contra quem fica testando senhas: 5 erros no mesmo e-mail (ou 20 do mesmo endereço de internet) em
// 15 minutos bloqueiam novas tentativas por 15 minutos. Fica na memória do servidor (um processo só).

const JANELA_MS = 15 * 60_000;
const LIMITE_EMAIL = 5;
const LIMITE_IP = 20;

const g = globalThis as unknown as { errosLogin?: Map<string, number[]> };
const erros = (g.errosLogin ??= new Map<string, number[]>());

function recentes(chave: string) {
  const agora = Date.now();
  const lista = (erros.get(chave) ?? []).filter((t) => agora - t < JANELA_MS);
  if (lista.length) erros.set(chave, lista);
  else erros.delete(chave);
  return lista;
}

/** Minutos que faltam para poder tentar de novo (0 = pode tentar). */
export function minutosBloqueado(email: string, ip: string) {
  const chaves: [string, number][] = [[`e:${email}`, LIMITE_EMAIL], ...(ip ? [[`i:${ip}`, LIMITE_IP] as [string, number]] : [])];
  let espera = 0;
  for (const [chave, limite] of chaves) {
    const lista = recentes(chave);
    if (lista.length >= limite) espera = Math.max(espera, lista[lista.length - limite]! + JANELA_MS - Date.now());
  }
  return espera > 0 ? Math.ceil(espera / 60_000) : 0;
}

export function registrarErro(email: string, ip: string) {
  for (const chave of [`e:${email}`, ...(ip ? [`i:${ip}`] : [])]) erros.set(chave, [...recentes(chave), Date.now()]);
  if (erros.size > 5000) erros.clear();
}

export function limparErros(email: string) {
  erros.delete(`e:${email}`);
}
