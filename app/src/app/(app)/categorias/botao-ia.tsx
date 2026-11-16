"use client";

import { Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { categorizarComIA } from "./actions";

/** Classifica com IA os produtos que ainda estão sem categoria. */
export function BotaoCategorizarIA({
  pendentes,
  variant = "gold",
}: {
  pendentes: number;
  variant?: "gold" | "outline";
}) {
  const [msg, setMsg] = useState<{ ok?: string; erro?: string } | null>(null);
  const [rodando, iniciar] = useTransition();
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        type="button"
        variant={variant}
        disabled={rodando || !pendentes}
        onClick={() => iniciar(async () => setMsg(await categorizarComIA()))}
      >
        <Sparkles />{" "}
        {rodando
          ? "Categorizando…"
          : `Categorizar com IA${pendentes ? ` (${pendentes})` : ""}`}
      </Button>
      {msg ? (
        <span className={msg.erro ? "text-xs text-red" : "text-xs text-green"}>
          {msg.erro ?? msg.ok}
        </span>
      ) : null}
    </span>
  );
}
