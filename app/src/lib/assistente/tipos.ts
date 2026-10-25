import type { AnexoIa, ConversaIa, FonteIa, MensagemIa } from "@/db/schema";

export type AnexoTela = Omit<AnexoIa, "texto">;
export type MensagemTela = { id: number; papel: "user" | "model"; texto: string; anexos: AnexoTela[]; fontes: FonteIa[]; modelo: string; criadoEm: string };
export type ConversaTela = Pick<ConversaIa, "id" | "titulo" | "pasta" | "fixada"> & { atualizadoEm: string };

export const paraTela = (m: MensagemIa): MensagemTela => ({
  id: m.id,
  papel: m.papel,
  texto: m.texto,
  anexos: m.anexos.map(({ texto: _t, ...a }) => a),
  fontes: m.fontes,
  modelo: m.modelo,
  criadoEm: m.criadoEm.toISOString(),
});

export const conversaParaTela = (c: ConversaIa): ConversaTela => ({ id: c.id, titulo: c.titulo, pasta: c.pasta, fixada: c.fixada, atualizadoEm: c.atualizadoEm.toISOString() });

/** URL do anexo (rota com login). */
export const urlAnexo = (a: { arquivo: string; nome: string }, baixar = false) =>
  `/api/assistente/arquivos/${a.arquivo}${baixar ? `?baixar=${encodeURIComponent(a.nome)}` : ""}`;
