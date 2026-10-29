"use client";

import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { Alert, Button, Field, Input, Select } from "@/components/ui";
import { onlyDigits } from "@/lib/utils";
import { sugerirNcmIA } from "./actions";
import type { SugestaoNcm } from "@/lib/fiscal/ncm";

type Ncm = { codigo: string; descricao: string; aliquotaIpi: number | null; pendente: boolean; fonte: string };
export type NcmCadastrado = { codigo: string; descricao: string };

/** NCMs já cadastrados (com descrição), para escolher numa lista. */
export function useNcmsCadastrados() {
  const [lista, setLista] = useState<NcmCadastrado[]>([]);
  useEffect(() => {
    fetch("/api/ncm")
      .then((r) => (r.ok ? r.json() : []))
      .then(setLista)
      .catch(() => undefined);
  }, []);
  return lista;
}

/** NCM escolhido na lista dos cadastrados (ou digitado, se for um novo), com a descrição oficial. */
export function NcmField({ defaultValue, valorIA }: { defaultValue?: string; /** NCM escolhido na janela "Gerar com IA". */ valorIA?: string }) {
  const [codigo, setCodigo] = useState(defaultValue ?? "");
  const cadastrados = useNcmsCadastrados();
  const [digitar, setDigitar] = useState(false);
  const naLista = cadastrados.some((n) => n.codigo === codigo);
  const [info, setInfo] = useState<Ncm | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [sugestoes, setSugestoes] = useState<SugestaoNcm[]>([]);
  const [erro, setErro] = useState("");
  const [sugerindo, start] = useTransition();

  useEffect(() => {
    if (valorIA) setCodigo(valorIA);
  }, [valorIA]);
  // Lista carregada e o NCM do produto não está nela: mostra o campo para digitar.
  const modoDigitar = digitar || !cadastrados.length || (codigo.length > 0 && !naLista);

  useEffect(() => {
    const c = onlyDigits(codigo);
    setInfo(null);
    if (c.length !== 8) return;
    const ctrl = new AbortController();
    setBuscando(true);
    fetch(`/api/ncm/${c}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setInfo(d))
      .catch(() => undefined)
      .finally(() => setBuscando(false));
    return () => ctrl.abort();
  }, [codigo]);

  function sugerir() {
    const form = document.querySelector<HTMLFormElement>("form:has(input[name=ncm])");
    const val = (n: string) => String(new FormData(form ?? undefined).get(n) ?? "");
    start(async () => {
      setErro("");
      const r = await sugerirNcmIA({ nome: val("nome"), descricao: val("descricao"), material: val("material") });
      if (r.sugestoes) setSugestoes(r.sugestoes);
      else setErro(r.erro ?? "Falha ao sugerir");
    });
  }

  return (
    <div className="grid gap-2 sm:col-span-6">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
        {modoDigitar ? (
          <Field label="NCM" hint="8 dígitos. Um NCM novo entra no cadastro de NCM e a IA completa a descrição.">
            <Input
              name="ncm"
              value={codigo}
              onChange={(e) => setCodigo(onlyDigits(e.target.value).slice(0, 8))}
              required
              inputMode="numeric"
              placeholder="39264000"
              autoFocus={digitar}
            />
          </Field>
        ) : (
          <Field label="NCM" hint="Escolha um dos NCMs cadastrados.">
            <Select
              name="ncm"
              value={codigo}
              required
              onChange={(e) => (e.target.value === "*" ? (setDigitar(true), setCodigo("")) : setCodigo(e.target.value))}
            >
              <option value="">Escolha o NCM...</option>
              {cadastrados.map((n) => (
                <option key={n.codigo} value={n.codigo}>
                  {n.codigo}
                      {n.descricao ? ` · ${n.descricao}` : ""}
                </option>
              ))}
              <option value="*">Outro NCM (digitar)...</option>
            </Select>
          </Field>
        )}
        {modoDigitar ? (
          <div className="flex gap-2 sm:mb-5">
            {cadastrados.length ? (
              <Button type="button" variant="outline" onClick={() => (setDigitar(false), setCodigo(""))}>
                Escolher da lista
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={sugerir} disabled={sugerindo}>
              {sugerindo ? <Loader2 className="animate-spin" /> : <Sparkles className="text-gold" />} Sugerir com IA
            </Button>
          </div>
        ) : null}
      </div>
      {buscando ? (
        <p className="flex items-center gap-2 text-xs text-muted">
          <Loader2 className="size-3 animate-spin" /> Buscando descrição do NCM...
        </p>
      ) : info ? (
        <p className={`text-xs ${info.pendente ? "text-gold" : "text-green"}`}>
          {info.pendente ? "Descrição pendente: configure o Gemini para completar." : <CheckCircle2 className="mr-1 inline size-3" />}
          {!info.pendente ? info.descricao : null}
          {info.aliquotaIpi !== null ? ` · IPI ${info.aliquotaIpi}%` : ""}
          {info.fonte === "ia" ? " · descrito pela IA" : ""}
        </p>
      ) : null}
      {erro ? <Alert>{erro}</Alert> : null}
      {sugestoes.length ? (
        <div className="grid gap-2 rounded-xl border border-gold/40 bg-surface-2 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Sugestões da IA (confira com o contador)</p>
          {sugestoes.map((s) => (
            <button
              key={s.ncm}
              type="button"
              onClick={() => (setCodigo(s.ncm), setSugestoes([]))}
              className="rounded-lg border border-border bg-surface p-2 text-left text-sm transition hover:border-gold"
            >
              <span className="font-mono font-semibold">{s.ncm}</span> · {s.descricao}
              {s.justificativa ? <span className="block text-xs text-muted">{s.justificativa}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
