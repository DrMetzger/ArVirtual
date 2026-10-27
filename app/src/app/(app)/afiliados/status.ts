export const STATUS_PRODUTO = {
  ideia: { rotulo: "Ideia", tom: "neutral" },
  divulgando: { rotulo: "Divulgando", tom: "green" },
  pausado: { rotulo: "Pausado", tom: "gold" },
} as const;

export const ORIGEM_VIDEO = {
  proprio: "Vídeo meu",
  anuncio: "Do anúncio do vendedor",
  criador: "De criador que autorizou",
  outro: "Outro",
} as const;

export const STATUS_VIDEO = {
  baixando: { rotulo: "Baixando…", tom: "blue" },
  bruto: { rotulo: "Bruto", tom: "neutral" },
  editado: { rotulo: "Editado", tom: "gold" },
  postado: { rotulo: "Postado", tom: "green" },
  erro: { rotulo: "Erro", tom: "red" },
} as const;
