import { requireUser } from "@/lib/auth";
import { danfePdf } from "@/lib/nfe/emissor";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  try {
    const f = await danfePdf((await params).id);
    return new Response(new Uint8Array(f.pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${f.nome}"` },
    });
  } catch (e) {
    return new Response((e as Error).message, { status: 404 });
  }
}
