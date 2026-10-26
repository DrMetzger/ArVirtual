import "server-only";
import { crc32 } from "node:zlib";

/** ZIP simples (sem compressão: fotos e vídeos já são comprimidos). */
export function criarZip(arquivos: { nome: string; dados: Buffer }[]): Buffer {
  const locais: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const a of arquivos) {
    const nome = Buffer.from(a.nome, "utf8");
    const crc = crc32(a.dados) >>> 0;
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0);
    h.writeUInt16LE(20, 4);
    h.writeUInt16LE(0x0800, 6); // nome em UTF-8
    h.writeUInt16LE(0, 8); // sem compressão
    h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(a.dados.length, 18);
    h.writeUInt32LE(a.dados.length, 22);
    h.writeUInt16LE(nome.length, 26);
    locais.push(h, nome, a.dados);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x0800, 8);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(a.dados.length, 20);
    c.writeUInt32LE(a.dados.length, 24);
    c.writeUInt16LE(nome.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, nome);
    offset += 30 + nome.length + a.dados.length;
  }
  const tamCentral = central.reduce((s, b) => s + b.length, 0);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(arquivos.length, 8);
  fim.writeUInt16LE(arquivos.length, 10);
  fim.writeUInt32LE(tamCentral, 12);
  fim.writeUInt32LE(offset, 16);
  return Buffer.concat([...locais, ...central, fim]);
}
