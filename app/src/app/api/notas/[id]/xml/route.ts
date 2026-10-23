import { requireUser } from "@/lib/auth";
import { arquivoXml } from "@/lib/nfe/emissor";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  try {
    const f = await arquivoXml((await params).id);
    return new Response(f.xml, {
      headers: { "Content-Type": "application/xml; charset=utf-8", "Content-Disposition": `attachment; filename="${f.nome}"` },
    });
  } catch (e) {
    return new Response((e as Error).message, { status: 404 });
  }
}
