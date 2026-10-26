import { publicarAnuncio } from "@/app/(app)/produtos/actions";

// Publicação fora da fila de server actions: uma ação lenta/antiga não segura o botão, e o resultado volta sempre.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const form = await req.formData().catch(() => null);
  if (!form) return Response.json([{ conta: "-", ok: false, mensagem: "Pedido inválido." }], { status: 400 });
  try {
    return Response.json(await publicarAnuncio(id, form));
  } catch (e) {
    console.error(`[anúncio] ${(e as Error).message}`);
    return Response.json([{ conta: "-", ok: false, mensagem: `Falha ao publicar: ${(e as Error).message}` }]);
  }
}
