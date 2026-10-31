/** Vídeo da biblioteca como a tela do conversor usa (sem dependência de servidor). */
export type VideoLista = {
  id: number;
  produtoId: number | null;
  produto: string | null;
  titulo: string;
  urlOrigem: string;
  arquivo: string;
  tamanho: number;
  duracaoS: number;
  status: string;
  erro: string;
  criadoEm: string;
};
