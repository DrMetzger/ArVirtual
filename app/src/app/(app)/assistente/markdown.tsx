"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function BlocoCodigo({ children, className }: { children: React.ReactNode; className?: string }) {
  const [copiado, setCopiado] = useState(false);
  const texto = String(children).replace(/\n$/, "");
  return (
    <div className="group relative my-2">
      <span className="absolute top-2 left-3 text-[10px] font-semibold tracking-wider text-[#8fa3c7] uppercase">{className?.replace("language-", "") ?? ""}</span>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(texto);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 1500);
        }}
        className="absolute top-1.5 right-1.5 rounded-lg p-1.5 text-[#8fa3c7] opacity-0 transition group-hover:opacity-100 hover:bg-white/10 hover:text-white"
        aria-label="Copiar código"
      >
        {copiado ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
      <pre className="overflow-x-auto rounded-xl bg-[#06112a] px-4 pt-7 pb-3 text-xs leading-relaxed text-[#e2e8f5]">
        <code>{texto}</code>
      </pre>
    </div>
  );
}

/** Markdown da resposta da IA (listas, tabelas, código), sem HTML cru. */
export function Markdown({ texto }: { texto: string }) {
  return (
    <div className="grid gap-2 text-sm leading-relaxed break-words [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (p) => <h3 className="mt-2 font-display text-lg font-bold" {...p} />,
          h2: (p) => <h3 className="mt-2 font-display text-base font-bold" {...p} />,
          h3: (p) => <h4 className="mt-1 font-semibold" {...p} />,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer" className="font-medium text-gold underline underline-offset-2">
              {children}
            </a>
          ),
          blockquote: (p) => <blockquote className="border-l-2 border-gold/60 pl-3 text-muted" {...p} />,
          table: (p) => (
            <div className="my-1 overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-left text-xs" {...p} />
            </div>
          ),
          th: (p) => <th className="border-b border-border bg-surface px-3 py-2 font-semibold" {...p} />,
          td: (p) => <td className="border-b border-border/60 px-3 py-2 align-top" {...p} />,
          hr: () => <hr className="my-2 border-border" />,
          code: ({ className, children }) =>
            className || String(children).includes("\n") ? (
              <BlocoCodigo className={className}>{children}</BlocoCodigo>
            ) : (
              <code className="rounded bg-surface px-1.5 py-0.5 text-[0.85em]">{children}</code>
            ),
          pre: ({ children }) => <>{children}</>,
        }}
      >
        {texto}
      </ReactMarkdown>
    </div>
  );
}
