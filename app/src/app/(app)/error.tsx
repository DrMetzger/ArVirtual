"use client";

import { ErroPagina } from "@/components/erro-pagina";

export default function Erro({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErroPagina error={error} reset={reset} />;
}
