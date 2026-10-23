import { LogOut } from "lucide-react";
import { Sidebar } from "@/components/sidebar";
import { ThemeToggle } from "@/components/ui/client";
import { requireUser } from "@/lib/auth";
import { logout } from "../login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const iniciais = user.nome
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-dvh">
      <Sidebar
        footer={
          <div className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-full bg-[#d4af37] text-sm font-bold text-[#0a1a33]">
              {iniciais}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white" title={user.nome}>
                {user.nome.split(" ")[0]}
              </p>
              <p className="text-xs capitalize text-sidebar-fg">{user.papel}</p>
            </div>
            <ThemeToggle className="border-white/10 bg-transparent text-white hover:text-[#e6c158]" />
            <form action={logout}>
              <button type="submit" className="grid size-9 place-items-center rounded-lg text-sidebar-fg hover:text-[#ef4b51]" title="Sair">
                <LogOut className="size-4" />
              </button>
            </form>
          </div>
        }
      />
      <main className="px-4 py-6 sm:px-8 sm:py-8 lg:ml-64">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
