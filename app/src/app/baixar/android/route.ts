import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { APK, infoApp } from "@/lib/app-android";

// Download público do app Android (o botão aparece na tela de login).
export async function GET() {
  const tamanho = await stat(APK).then((s) => s.size).catch(() => -1);
  if (tamanho < 0) return new Response("O app ainda não foi gerado.", { status: 404 });
  const versao = (await infoApp())?.versao ?? "";
  return new Response(Readable.toWeb(createReadStream(APK)) as ReadableStream, {
    headers: {
      "Content-Type": "application/vnd.android.package-archive",
      "Content-Disposition": `attachment; filename="ArVirtual${versao ? `-${versao}` : ""}.apk"`,
      "Content-Length": String(tamanho),
      "Cache-Control": "no-store",
    },
  });
}
