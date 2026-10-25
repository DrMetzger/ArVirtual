import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

// Layout dos e-mails do sistema: tabelas e estilos inline (é o que Gmail, Outlook e celulares respeitam).
// O logo vai anexado como imagem embutida (cid), então aparece mesmo sem "baixar imagens".

export const CID_LOGO = "logo@arvirtual";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function anexoLogo() {
  try {
    const content = await readFile(path.join(process.cwd(), "public", "logo-mark-dark.png"));
    return [{ filename: "arvirtual.png", content, cid: CID_LOGO }];
  } catch {
    return [];
  }
}

/** Código de verificação em caixas, um dígito por caixa. */
export function blocoCodigo(codigo: string) {
  const celulas = [...codigo]
    .map(
      (d) =>
        `<td style="padding:0 4px"><div style="width:44px;height:56px;line-height:56px;border:1px solid #c9d6e6;border-radius:10px;background:#f4f7fb;font:700 30px/56px 'Segoe UI',Arial,sans-serif;color:#0b2a4f;text-align:center">${esc(d)}</div></td>`,
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:8px auto 4px"><tr>${celulas}</tr></table>`;
}

export function botao(texto: string, url: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0"><tr><td style="border-radius:10px;background:#d4af37"><a href="${esc(url)}" style="display:inline-block;padding:12px 22px;font:700 14px 'Segoe UI',Arial,sans-serif;color:#0b1f3a;text-decoration:none;border-radius:10px">${esc(texto)}</a></td></tr></table>`;
}

export const paragrafo = (html: string, estilo = "") => `<p style="margin:0 0 14px;font:15px/1.6 'Segoe UI',Arial,sans-serif;color:#1f2f45;${estilo}">${html}</p>`;

/** Página completa do e-mail. `corpo` é HTML já escapado; `resumo` aparece na prévia da caixa de entrada. */
export function layoutEmail({ titulo, resumo, corpo, rodape }: { titulo: string; resumo: string; corpo: string; rodape?: string }) {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${esc(titulo)}</title></head>
<body style="margin:0;padding:0;background:#eef2f7">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(resumo)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef2f7"><tr><td align="center" style="padding:32px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #dbe4ef">
<tr><td style="background:#0b1f3a;background-image:linear-gradient(135deg,#0f3b66,#06112a);padding:22px 28px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="padding-right:14px;vertical-align:middle"><img src="cid:${CID_LOGO}" width="64" height="38" alt="ArVirtual" style="display:block;border:0;width:64px;height:auto"></td>
<td style="vertical-align:middle;border-left:1px solid rgba(255,255,255,.18);padding-left:14px">
<div style="font:800 20px/1.1 'Segoe UI',Arial,sans-serif;color:#ffffff;letter-spacing:2px">ARVIRTUAL</div>
<div style="font:600 10px/1.4 'Segoe UI',Arial,sans-serif;color:#e6c158;letter-spacing:2.5px;margin-top:3px">PESQUISA &amp; DESENVOLVIMENTO</div>
</td></tr></table>
</td></tr>
<tr><td style="height:4px;background:#d4af37;font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="padding:32px 28px 12px">
<h1 style="margin:0 0 18px;font:700 22px/1.3 'Segoe UI',Arial,sans-serif;color:#0b1f3a">${esc(titulo)}</h1>
${corpo}
</td></tr>
<tr><td style="padding:0 28px 28px">
<div style="border-top:1px solid #e3e9f1;padding-top:16px;font:12px/1.6 'Segoe UI',Arial,sans-serif;color:#6b7a90">${rodape ?? "Mensagem automática do sistema ArVirtual. Não responda este e-mail."}</div>
</td></tr>
</table>
<div style="font:11px/1.6 'Segoe UI',Arial,sans-serif;color:#8a97ab;padding-top:14px">ArVirtual · São José do Rio Preto (SP) · arvirtual.com.br</div>
</td></tr></table>
</body></html>`;
}

export { esc as escaparHtml };
