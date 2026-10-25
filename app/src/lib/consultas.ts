import "server-only";
import { consultarApicpf } from "./apicpf";
import { isValidCnpj, isValidCpf } from "./documento";
import { onlyDigits } from "./utils";

const TIMEOUT_MS = 8000;

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  if (!res.ok) throw new Error(`${new URL(url).host} respondeu ${res.status}`);
  return (await res.json()) as T;
}

// ---------------- CEP ----------------
export type EnderecoCep = {
  cep: string;
  logradouro: string;
  bairro: string;
  cidade: string;
  uf: string;
  codigoIbge: string;
  fonte: string;
};

/** Base dos Correios via ViaCEP (traz o código IBGE, exigido na NF-e), com BrasilAPI como reserva. */
export async function consultarCep(cepRaw: string): Promise<EnderecoCep> {
  const cep = onlyDigits(cepRaw);
  if (cep.length !== 8) throw new Error("CEP deve ter 8 dígitos");

  try {
    const v = await getJson<{
      erro?: boolean | string;
      logradouro: string;
      bairro: string;
      localidade: string;
      uf: string;
      ibge: string;
    }>(`https://viacep.com.br/ws/${cep}/json/`);
    if (!v.erro) {
      return { cep, logradouro: v.logradouro, bairro: v.bairro, cidade: v.localidade, uf: v.uf, codigoIbge: v.ibge, fonte: "ViaCEP" };
    }
  } catch {
    // tenta a próxima fonte
  }

  const b = await getJson<{ street: string; neighborhood: string; city: string; state: string }>(
    `https://brasilapi.com.br/api/cep/v2/${cep}`,
  ).catch(() => {
    throw new Error("CEP não encontrado");
  });
  return { cep, logradouro: b.street ?? "", bairro: b.neighborhood ?? "", cidade: b.city, uf: b.state, codigoIbge: "", fonte: "BrasilAPI" };
}

// ---------------- CNPJ / CPF ----------------
export type DadosReceita = {
  tipo: "PF" | "PJ";
  documento: string;
  nome: string;
  nomeFantasia: string;
  situacao: string;
  inscricaoEstadual: string;
  email: string;
  telefone: string;
  endereco: Omit<EnderecoCep, "fonte"> & { numero: string; complemento: string } | null;
  /** Só CPF (APICPF): data de nascimento AAAA-MM-DD. */
  nascimento?: string;
  fonte: string;
  bruto: unknown;
};

async function consultarCnpj(cnpj: string): Promise<DadosReceita> {
  // CNPJ.ws (dados públicos da Receita, inclui inscrições estaduais)
  try {
    type Ws = {
      razao_social: string;
      estabelecimento: {
        nome_fantasia: string | null;
        situacao_cadastral: string;
        tipo_logradouro: string | null;
        logradouro: string;
        numero: string;
        complemento: string | null;
        bairro: string;
        cep: string;
        email: string | null;
        ddd1: string | null;
        telefone1: string | null;
        cidade: { nome: string; ibge_id: number };
        estado: { sigla: string };
        inscricoes_estaduais: { inscricao_estadual: string; ativo: boolean; estado: { sigla: string } }[];
      };
    };
    const r = await getJson<Ws>(`https://publica.cnpj.ws/cnpj/${cnpj}`);
    const e = r.estabelecimento;
    const ie = e.inscricoes_estaduais.find((i) => i.ativo && i.estado.sigla === e.estado.sigla);
    return {
      tipo: "PJ",
      documento: cnpj,
      nome: r.razao_social,
      nomeFantasia: e.nome_fantasia ?? "",
      situacao: e.situacao_cadastral,
      inscricaoEstadual: ie?.inscricao_estadual ?? "",
      email: e.email ?? "",
      telefone: e.ddd1 && e.telefone1 ? `${e.ddd1}${e.telefone1}` : "",
      endereco: {
        cep: onlyDigits(e.cep),
        logradouro: [e.tipo_logradouro, e.logradouro].filter(Boolean).join(" "),
        numero: e.numero,
        complemento: e.complemento ?? "",
        bairro: e.bairro,
        cidade: e.cidade.nome,
        uf: e.estado.sigla,
        codigoIbge: String(e.cidade.ibge_id ?? ""),
      },
      fonte: "Receita Federal (CNPJ.ws)",
      bruto: r,
    };
  } catch {
    // BrasilAPI como reserva
  }

  type Br = {
    razao_social: string;
    nome_fantasia: string;
    descricao_situacao_cadastral: string;
    descricao_tipo_de_logradouro: string;
    logradouro: string;
    numero: string;
    complemento: string;
    bairro: string;
    cep: string;
    municipio: string;
    uf: string;
    codigo_municipio_ibge: number | null;
    email: string | null;
    ddd_telefone_1: string;
  };
  const r = await getJson<Br>(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`).catch(() => {
    throw new Error("CNPJ não encontrado na Receita");
  });
  return {
    tipo: "PJ",
    documento: cnpj,
    nome: r.razao_social,
    nomeFantasia: r.nome_fantasia ?? "",
    situacao: r.descricao_situacao_cadastral,
    inscricaoEstadual: "",
    email: r.email ?? "",
    telefone: onlyDigits(r.ddd_telefone_1 ?? ""),
    endereco: {
      cep: onlyDigits(r.cep),
      logradouro: [r.descricao_tipo_de_logradouro, r.logradouro].filter(Boolean).join(" "),
      numero: r.numero,
      complemento: r.complemento ?? "",
      bairro: r.bairro,
      cidade: r.municipio,
      uf: r.uf,
      codigoIbge: r.codigo_municipio_ibge ? String(r.codigo_municipio_ibge) : "",
    },
    fonte: "Receita Federal (BrasilAPI)",
    bruto: r,
  };
}

/** CPF: a Receita não tem consulta pública gratuita; o nome vem da APICPF (com limite e cache). */
async function consultarCpf(cpf: string): Promise<DadosReceita> {
  const p = await consultarApicpf(cpf);
  if (!p) throw new Error("CPF válido, mas não encontrado na APICPF. Preencha o nome à mão.");
  return {
    tipo: "PF",
    documento: cpf,
    nome: p.nome,
    nomeFantasia: "",
    situacao: "",
    inscricaoEstadual: "",
    email: "",
    telefone: "",
    endereco: null,
    nascimento: p.dataNascimento,
    fonte: "APICPF",
    bruto: p,
  };
}

export async function consultarDocumento(raw: string): Promise<DadosReceita> {
  const doc = onlyDigits(raw);
  if (doc.length === 14) {
    if (!isValidCnpj(doc)) throw new Error("CNPJ inválido");
    return consultarCnpj(doc);
  }
  if (doc.length === 11) {
    if (!isValidCpf(doc)) throw new Error("CPF inválido");
    return consultarCpf(doc);
  }
  throw new Error("Informe um CPF (11 dígitos) ou CNPJ (14 dígitos)");
}
