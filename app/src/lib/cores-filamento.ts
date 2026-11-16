// Liga a cor de um modelo 3D ao filamento do estoque mais parecido (usado na tela e no cadastro automático).

export type FilamentoCor = { id: number; material: string; corHex: string };

function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "").slice(0, 6).padEnd(6, "0");
  const c = (i: number) => parseInt(h.slice(i, i + 2), 16) || 0;
  return [c(0), c(2), c(4)];
}

/** Filamento mais parecido com a cor (distância perceptiva) e, de preferência, do mesmo material. */
export function maisParecido(f: { tipo: string; cor: string }, fils: FilamentoCor[]) {
  const [r, g, b] = rgb(f.cor);
  const tipo = f.tipo.toUpperCase().split(/\s/)[0] ?? "PLA";
  let melhor: FilamentoCor | null = null;
  let menor = Infinity;
  for (const x of fils) {
    const [r2, g2, b2] = rgb(x.corHex);
    const d = Math.sqrt(2 * (r - r2) ** 2 + 4 * (g - g2) ** 2 + 3 * (b - b2) ** 2) + (x.material.toUpperCase().startsWith(tipo) ? 0 : 400);
    if (d < menor) {
      menor = d;
      melhor = x;
    }
  }
  return melhor?.id ?? null;
}

/** Tempo estimado pelo peso quando o site não informa (~4 min por grama, bico 0,4 e camada 0,2). */
export const tempoPeloPeso = (g: number) => Math.round(g * 4);
