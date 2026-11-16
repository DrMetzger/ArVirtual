import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";

// Guarda a escolha de visualização (cards/grade) e volta para a lista.
export async function GET(req: NextRequest) {
  await requireUser();
  const v = req.nextUrl.searchParams.get("v") === "grade" ? "grade" : "cards";
  const q = req.nextUrl.searchParams.get("q");
  const cat = req.nextUrl.searchParams.get("cat");
  const base = process.env.APP_URL ?? req.nextUrl.origin;
  const res = NextResponse.redirect(`${base}/produtos?vista=${v}${q ? `&q=${encodeURIComponent(q)}` : ""}${cat && /^(sem|\d+)$/.test(cat) ? `&cat=${cat}` : ""}`);
  res.cookies.set("arv_produtos_vista", v, { path: "/", maxAge: 31536000, sameSite: "lax" });
  return res;
}
