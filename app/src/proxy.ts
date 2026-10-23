import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

// Checagem otimista: sem sessão válida, manda para o login.
// A autorização de verdade acontece em requireUser() nas páginas, ações e rotas.
export async function proxy(req: NextRequest) {
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  // /login e /login/verificar (código da verificação em duas etapas) são públicas.
  const isLogin = req.nextUrl.pathname === "/login" || req.nextUrl.pathname.startsWith("/login/");

  if (!session && !isLogin) {
    if (req.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
    }
    const url = new URL("/login", req.url);
    url.searchParams.set("de", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  if (session && isLogin) return NextResponse.redirect(new URL("/", req.url));
  return NextResponse.next();
}

export const config = {
  // Fora: arquivos estáticos, imagens de produto (públicas p/ marketplaces) e a checagem de saúde.
  matcher: ["/((?!_next/|api/health|uploads/|icon.png|apple-icon.png|logo).*)"],
};
