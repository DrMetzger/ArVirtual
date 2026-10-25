// Roda uma vez quando o servidor sobe. Agenda a sincronização automática dos pedidos dos marketplaces.
const INTERVALO_MS = 15 * 60_000;

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.PEDIDOS_SYNC_DESATIVADO === "1") return;
  const { chaveInterna } = await import("./lib/interno");
  const url = `http://127.0.0.1:${process.env.PORT ?? 3000}/api/interno/sincronizar`;
  const sincronizar = (completo = false) =>
    fetch(completo ? `${url}?completo=1` : url, { method: "POST", headers: { "x-chave-interna": chaveInterna() }, signal: AbortSignal.timeout(10 * 60_000) })
      .then(async (r) => {
        const falhas = r.ok ? ((await r.json()) as { conta: string; erro?: string }[]).filter((x) => x.erro) : [];
        for (const f of falhas) console.warn(`[pedidos] ${f.conta}: ${f.erro}`);
      })
      .catch((e: Error) => console.warn(`[pedidos] sincronização automática falhou: ${e.message}`));
  // Primeira rodada 1 minuto depois de subir: confere o histórico todo (2 anos). Depois, só o que mudou.
  setTimeout(() => sincronizar(true), 60_000);
  setInterval(() => sincronizar(), INTERVALO_MS);
}
