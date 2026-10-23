import "server-only";
import forge from "node-forge";
import { db } from "@/db";
import { decrypt } from "@/lib/crypto";
import { certificateFromPfx } from "@/lib/nfe/sefaz";
import { onlyDigits } from "@/lib/utils";

export type InfoCertificado = { titular: string; cnpj: string; validoDe: Date; validoAte: Date };

// OID ICP-Brasil do CNPJ da pessoa jurídica (dentro do SubjectAltName/otherName).
const OID_CNPJ = "2.16.76.1.3.3";
// OIDs dos "bags" do PKCS#12 (RFC 7292).
const BAG_CHAVE_CIFRADA = "1.2.840.113549.1.12.10.1.2";
const BAG_CHAVE = "1.2.840.113549.1.12.10.1.1";
const BAG_CERT = "1.2.840.113549.1.12.10.1.3";

/** Abre o .pfx/.p12 com a senha e extrai titular, CNPJ e validade do certificado da chave privada. */
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
  const bags = (tipo: string): forge.pkcs12.Bag[] => p12.getBags({ bagType: tipo })[tipo] ?? [];

  const chave = [...bags(BAG_CHAVE_CIFRADA), ...bags(BAG_CHAVE)].find((b) => b.key)?.key as forge.pki.rsa.PrivateKey | undefined;
  if (!chave) throw new Error("O arquivo não tem a chave privada: exporte o certificado A1 completo (.pfx).");

  // Como no ERP Vanguard: o certificado certo é o da chave privada (o arquivo traz também a cadeia).
  const certs = bags(BAG_CERT)
    .map((b) => b.cert)
    .filter((c): c is forge.pki.Certificate => Boolean(c));
  const cert = certs.find((c) => (c.publicKey as forge.pki.rsa.PublicKey).n?.equals(chave.n));
  if (!cert) throw new Error("Não achei no arquivo o certificado da chave privada.");

  const cn = String(cert.subject.getField("CN")?.value ?? "");
  const [nome, docCn] = cn.split(":");
  let cnpj = onlyDigits(docCn ?? "");
  if (cnpj.length !== 14) {
    const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
    const idx = der.indexOf(forge.asn1.oidToDer(OID_CNPJ).getBytes());
    if (idx >= 0) cnpj = (der.slice(idx, idx + 40).match(/\d{14}/) ?? [""])[0];
  }
  return { titular: (nome ?? cn).trim(), cnpj, validoDe: cert.validity.notBefore, validoAte: cert.validity.notAfter };
}

export function diasParaVencer(validoAte: Date) {
  return Math.floor((validoAte.getTime() - Date.now()) / 86_400_000);
}

/** Certificado pronto para assinar e falar com a SEFAZ (lança erro amigável se faltar ou estiver vencido). */
export async function carregarCertificado() {
  const row = await db.query.certificadoDigital.findFirst();
  if (!row) throw new Error("Nenhum certificado A1 cadastrado. Envie em Configurações › Certificado A1.");
  if (row.validoAte.getTime() < Date.now()) {
    throw new Error(`Certificado A1 vencido em ${row.validoAte.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}: envie o novo.`);
  }
  try {
    return certificateFromPfx(decrypt(row.arquivoEnc), decrypt(row.senhaEnc));
  } catch (e) {
    throw new Error(`Não foi possível abrir o certificado A1: ${(e as Error).message}`);
  }
}
