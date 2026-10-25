"use client";

import "./globals.css";
import { ErroPagina } from "@/components/erro-pagina";

// Erro fora do layout do sistema (ex.: no próprio layout): precisa de html/body próprios.
export default function ErroGlobal({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="pt-BR">
      <body>
        <ErroPagina error={error} />
      </body>
    </html>
  );
}
