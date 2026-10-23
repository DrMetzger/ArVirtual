import "server-only";
import { readFile } from "node:fs/promises";
import { DanfeGenerator } from "@brasil-fiscal/nfe/dist/infra/danfe/DanfeGenerator";
import { parseNFeXml } from "@brasil-fiscal/nfe/dist/infra/danfe/xml-parser";
import { db } from "@/db";
import { UPLOAD_DIR } from "@/lib/uploads";

// DANFE da @brasil-fiscal/nfe com o logo da empresa no quadro do emitente.
// A biblioteca não tem logo: o cabeçalho é desenhado por ela e, enquanto isso, o texto do
// emitente é empurrado para a direita do logo.

// Medidas do layout da biblioteca (DanfeGenerator.js): margem e respiro interno.
const M = 28;
const P = 3;
const ALTURA_CABECALHO = 90;
const LOGO_W = 64;

type Texto = (t: unknown, x?: unknown, y?: unknown, opts?: { width?: number }) => unknown;
type Pdf = { text: Texto; image: (src: Buffer, x: number, y: number, o: object) => unknown };
type ComCabecalho = { cabecalho: (doc: Pdf, d: unknown, y: number) => number };

async function logoDaEmpresa(): Promise<Buffer | null> {
  const emp = await db.query.empresa.findFirst({ columns: { logoArquivo: true } });
  if (!emp?.logoArquivo) return null;
  return readFile(`${UPLOAD_DIR}/${emp.logoArquivo}`).catch(() => null);
}

export async function gerarDanfe(xml: string): Promise<Buffer> {
  if (!xml.includes("<infNFe")) throw new Error("XML inválido: falta o <infNFe>.");
  const gerador = new DanfeGenerator();
  const logo = await logoDaEmpresa();
  if (logo) {
    const g = gerador as unknown as ComCabecalho;
    const original = g.cabecalho.bind(gerador);
    g.cabecalho = (doc, d, y) => {
      const texto = doc.text.bind(doc);
      // Texto da coluna do emitente (x = M + P, dentro do cabeçalho, abaixo do rótulo) vai para a direita do logo.
      doc.text = (t: unknown, x?: unknown, yy?: unknown, opts?: { width?: number }) =>
        x === M + P && typeof yy === "number" && yy > y + 10 && yy < y + ALTURA_CABECALHO
          ? texto(t, x + LOGO_W + P, yy, { ...opts, width: (opts?.width ?? 0) - LOGO_W - P })
          : texto(t, x, yy, opts);
      try {
        return original(doc, d, y);
      } finally {
        doc.text = texto;
        doc.image(logo, M + P, y + 13, { fit: [LOGO_W, ALTURA_CABECALHO - 18], align: "center", valign: "center" });
      }
    };
  }
  return gerador.generate(parseNFeXml(xml));
}
