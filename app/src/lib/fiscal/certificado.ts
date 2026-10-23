import "server-only";
import forge from "node-forge";
import { getSettings } from "@/lib/settings";
import { onlyDigits } from "@/lib/utils";

export type InfoCertificado = { titular: string; cnpj: string; validoDe: Date; validoAte: Date };

// OID ICP-Brasil do CNPJ da pessoa jurídica (dentro do SubjectAltName/otherName).
const OID_CNPJ = "2.16.76.1.3.3";

/** Abre o .pfx/.p12 com a senha e extrai titular, CNPJ e validade. Lança erro amigável se não abrir. */
export function lerCertificado(arquivo: Buffer, senha: string): InfoCertificado {
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(arquivo.toString("binary")));
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, senha);
  } catch (e) {
    const msg = String((e as Error).message ?? "");
    if (/mac|password|invalid/i.test(msg)) throw new Error("Senha do certificado incorreta.");
    throw new Error("Arquivo inválido: envie o certificado A1 no formato .pfx ou .p12.");
  }

  // OIDs dos "bags" do PKCS#12 (RFC 7292).
  const BAG_CHAVE_CIFRADA = "1.2.840.113549.1.12.10.1.2";
  const BAG_CHAVE = "1.2.840.113549.1.12.10.1.1";
  const BAG_CERT = "1.2.840.113549.1.12.10.1.3";
  const bags = (tipo: string): forge.pkcs12.Bag[] => p12.getBags({ bagType: tipo })[tipo] ?? [];

  if (bags(BAG_CHAVE_CIFRADA).length + bags(BAG_CHAVE).length === 0) {
    throw new Error("O arquivo não tem a chave privada: exporte o certificado A1 completo (.pfx).");
  }

  const certs = bags(BAG_CERT)
    .map((b) => b.cert)
    .filter((c): c is forge.pki.Certificate => Boolean(c));
  // O certificado do titular é o que não é autoridade certificadora.
  const cert =
    certs.find((c) => !(c.getExtension("basicConstraints") as { cA?: boolean } | null)?.cA) ?? certs[0];
  if (!cert) throw new Error("Nenhum certificado encontrado no arquivo.");

  const cn = String(cert.subject.getField("CN")?.value ?? "");
  const [nome, docCn] = cn.split(":");
  let cnpj = onlyDigits(docCn ?? "");
  if (cnpj.length !== 14) {
    // Formato ICP-Brasil: o CNPJ fica no otherName do SubjectAltName.
    const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
    const idx = der.indexOf(forge.asn1.oidToDer(OID_CNPJ).getBytes());
    if (idx >= 0) cnpj = (der.slice(idx, idx + 40).match(/\d{14}/) ?? [""])[0];
  }

  return {
    titular: (nome ?? cn).trim(),
    cnpj,
    validoDe: cert.validity.notBefore,
    validoAte: cert.validity.notAfter,
  };
}

export function diasParaVencer(validoAte: Date) {
  return Math.floor((validoAte.getTime() - Date.now()) / 86_400_000);
}

/**
 * Envia o certificado para a empresa cadastrada na Focus NFe (API de Empresas).
 * Docs: GET /v2/empresas?cnpj=  e  PUT /v2/empresas/{id} com arquivo_certificado_base64 / senha_certificado.
 */
export async function enviarCertificadoFocus(arquivo: Buffer, senha: string, cnpjEmpresa: string): Promise<string> {
  const s = await getSettings(["focusnfe.token"]);
  if (!s["focusnfe.token"]) throw new Error("Cadastre o token da Focus NFe em Configurações › Integrações.");
  const auth = `Basic ${Buffer.from(`${s["focusnfe.token"]}:`).toString("base64")}`;
  const base = "https://api.focusnfe.com.br/v2/empresas";

  const busca = await fetch(`${base}?cnpj=${onlyDigits(cnpjEmpresa)}`, {
    headers: { Authorization: auth },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (busca.status === 401 || busca.status === 403) {
    throw new Error("O token da Focus não tem acesso à API de Empresas. Use o token principal da conta ou envie o certificado pelo painel da Focus.");
  }
  if (!busca.ok) throw new Error(`Focus NFe respondeu ${busca.status} ao buscar a empresa.`);
  const empresas = (await busca.json()) as { id: number }[];
  const id = empresas[0]?.id;
  if (!id) throw new Error(`Empresa com CNPJ ${cnpjEmpresa} não encontrada na Focus NFe. Cadastre-a no painel da Focus.`);

  const res = await fetch(`${base}/${id}`, {
    method: "PUT",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({ arquivo_certificado_base64: arquivo.toString("base64"), senha_certificado: senha }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await res.json().catch(() => ({}))) as { mensagem?: string; certificado_valido_ate?: string; erros?: { mensagem: string }[] };
  if (!res.ok) throw new Error(`Focus NFe: ${body.erros?.map((e) => e.mensagem).join(" | ") || body.mensagem || res.status}`);
  return body.certificado_valido_ate ? `Certificado ativo na Focus até ${body.certificado_valido_ate}.` : "Certificado enviado à Focus NFe.";
}
