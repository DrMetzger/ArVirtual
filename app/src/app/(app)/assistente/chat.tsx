"use client";

import { Bot, Loader2, SendHorizonal, Sparkles, Trash2, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, Card, Textarea } from "@/components/ui";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "model"; text: string };

const SUGESTOES = [
  "Qual NCM e CFOP uso para vender peças decorativas impressas em PLA para consumidor final em outro estado?",
  "Crie 5 ideias de produtos impressos em 3D que vendem bem na Shopee, com faixa de preço.",
  "Escreva uma descrição de anúncio para um suporte de headset impresso em PETG.",
  "Como integrar um ESP32 para monitorar a temperatura da impressora e avisar no WhatsApp?",
];

/** Formatação leve: **negrito**, `código` e quebras de linha, sem injetar HTML. */
function Texto({ text }: { text: string }) {
  return (
    <div className="grid gap-2 whitespace-pre-wrap text-sm leading-relaxed">
      {text.split(/\n{2,}/).map((par, i) => (
        <p key={i}>
          {par.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, j) =>
            part.startsWith("**") ? (
              <strong key={j}>{part.slice(2, -2)}</strong>
            ) : part.startsWith("`") ? (
              <code key={j} className="rounded bg-surface-2 px-1 py-0.5 text-xs">
                {part.slice(1, -1)}
              </code>
            ) : (
              part
            ),
          )}
        </p>
      ))}
    </div>
  );
}

export function Chat() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const fim = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const salvo = sessionStorage.getItem("arv-chat");
      if (salvo) setMsgs(JSON.parse(salvo));
    } catch {
      // sem histórico
    }
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem("arv-chat", JSON.stringify(msgs.slice(-40)));
    } catch {
      // armazenamento indisponível
    }
    fim.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  async function enviar(texto: string) {
    const t = texto.trim();
    if (!t || loading) return;
    const historico: Msg[] = [...msgs, { role: "user", text: t }];
    setMsgs(historico);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/assistente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensagens: historico.slice(-20) }),
      });
      const data = await res.json();
      setMsgs([...historico, { role: "model", text: res.ok ? data.texto : `⚠️ ${data.erro}` }]);
    } catch {
      setMsgs([...historico, { role: "model", text: "⚠️ Não foi possível falar com o assistente agora." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="flex h-[calc(100dvh-13rem)] min-h-[28rem] flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-5">
        {msgs.length === 0 ? (
          <div className="mx-auto grid max-w-2xl gap-6 py-8 text-center">
            <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-gradient-to-br from-[#0f3b66] to-[#06112a] text-[#e6c158] shadow-card">
              <Sparkles className="size-8" />
            </div>
            <div>
              <p className="font-display text-xl font-bold">Como posso ajudar hoje?</p>
              <p className="mt-1 text-sm text-muted">Pergunte sobre anúncios, precificação, tributação, automação ou integrações.</p>
            </div>
            <div className="grid gap-2 text-left sm:grid-cols-2">
              {SUGESTOES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => enviar(s)}
                  className="rounded-xl border border-border p-3 text-sm text-muted transition hover:border-gold hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto grid max-w-3xl gap-5">
            {msgs.map((m, i) => (
              <div key={i} className={cn("flex gap-3", m.role === "user" && "flex-row-reverse")}>
                <div
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-full",
                    m.role === "user" ? "bg-primary text-primary-fg" : "bg-[#0a1a33] text-[#e6c158]",
                  )}
                >
                  {m.role === "user" ? <User className="size-4" /> : <Bot className="size-4" />}
                </div>
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-3",
                    m.role === "user" ? "rounded-tr-sm bg-primary text-primary-fg" : "rounded-tl-sm border border-border bg-surface-2",
                  )}
                >
                  <Texto text={m.text} />
                </div>
              </div>
            ))}
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted">
                <Loader2 className="size-4 animate-spin text-gold" /> Pensando...
              </div>
            ) : null}
            <div ref={fim} />
          </div>
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void enviar(input);
        }}
        className="flex items-end gap-2 border-t border-border p-3"
      >
        {msgs.length ? (
          <Button type="button" variant="ghost" size="icon" title="Nova conversa" onClick={() => setMsgs([])}>
            <Trash2 />
          </Button>
        ) : null}
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void enviar(input);
            }
          }}
          placeholder="Escreva sua pergunta (Enter envia, Shift+Enter quebra linha)"
          rows={1}
          className="max-h-40 min-h-10 resize-none"
        />
        <Button type="submit" variant="gold" size="icon" disabled={loading || !input.trim()} aria-label="Enviar">
          <SendHorizonal />
        </Button>
      </form>
    </Card>
  );
}
