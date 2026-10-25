import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const onlyDigits = (v: string) => v.replace(/\D/g, "");

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const formatBRL = (v: number) => brl.format(v || 0);
/** Valor em reais para campos de digitação: sempre 2 casas, vírgula decimal (49,90). */
export const formatValor = (v: number | null | undefined) => (v || v === 0 ? Number(v).toFixed(2).replace(".", ",") : "");

export const formatDate = (d: Date | string) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(
    new Date(d),
  );

export function formatDocumento(doc: string) {
  const d = onlyDigits(doc);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return doc;
}

export const formatCep = (cep: string) => onlyDigits(cep).replace(/(\d{5})(\d{3})/, "$1-$2");

export function formatTelefone(t: string) {
  const d = onlyDigits(t);
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  return t;
}

/** Número de formulário em formato brasileiro ("1.234,56") ou internacional ("1234.56"). */
export function parseDecimal(v: FormDataEntryValue | null | undefined): number {
  const s = String(v ?? "").trim();
  if (!s) return 0;
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB",
  "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
] as const;
