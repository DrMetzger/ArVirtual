"use client";

import { Check, Copy, Eye, EyeOff, Loader2, Moon, Sun, WandSparkles } from "lucide-react";
import { startTransition, useActionState, useEffect, useRef, useState, type ComponentProps, type FormEvent } from "react";
import { useFormStatus } from "react-dom";
import { Button, Input, type ButtonSize, type ButtonVariant } from "./index";

/**
 * Como useActionState, mas envia pelo onSubmit para o React não limpar o formulário:
 * em caso de erro, o que foi digitado continua na tela.
 */
export function useFormAction<S>(action: (state: Awaited<S>, form: FormData) => S | Promise<S>, initial: Awaited<S>) {
  const [state, dispatch, pending] = useActionState(action, initial);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    startTransition(() => dispatch(form));
  };
  return [state, onSubmit, pending] as const;
}

export function SubmitButton({
  children,
  pendingText,
  variant,
  pending: pendingProp,
  ...props
}: ComponentProps<"button"> & { pendingText?: string; variant?: ButtonVariant; size?: ButtonSize; pending?: boolean }) {
  const status = useFormStatus();
  const pending = pendingProp ?? status.pending;
  return (
    <Button {...props} type="submit" variant={variant} disabled={pending || props.disabled}>
      {pending ? <Loader2 className="animate-spin" /> : null}
      {pending && pendingText ? pendingText : children}
    </Button>
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("arv-theme", next);
    } catch {
      // sem armazenamento: o tema vale só para esta aba
    }
    setTheme(next);
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={toggle}
      className={className}
      aria-label={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
      title="Alternar tema"
    >
      {theme === "dark" ? <Sun /> : <Moon />}
    </Button>
  );
}

/** Senha forte e fácil de digitar (sem 0/O, 1/l/I). */
export function gerarSenha(tamanho = 12) {
  const letras = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const v = crypto.getRandomValues(new Uint32Array(tamanho));
  return Array.from(v, (n) => letras[n % letras.length]).join("") + "!";
}

/** Campo de senha com o "olho" para mostrar/ocultar e, opcionalmente, botões de gerar e copiar senha. */
export function InputSenha({ gerar, className, ...props }: ComponentProps<"input"> & { gerar?: boolean }) {
  const [visivel, setVisivel] = useState(false);
  const [valor, setValor] = useState(String(props.defaultValue ?? ""));
  const [copiado, setCopiado] = useState(false);
  const controlado = props.value !== undefined;
  const { defaultValue: _d, ...resto } = props;
  const ref = useRef<HTMLInputElement>(null);
  // O formulário limpa os campos depois de salvar (reset): limpa também a senha guardada aqui.
  useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;
    const limpar = () => {
      setValor("");
      setVisivel(false);
    };
    form.addEventListener("reset", limpar);
    return () => form.removeEventListener("reset", limpar);
  }, []);
  return (
    <div className="relative">
      <Input
        ref={ref}
        {...resto}
        type={visivel ? "text" : "password"}
        {...(controlado ? {} : { value: valor })}
        onChange={(e) => {
          if (!controlado) setValor(e.target.value);
          props.onChange?.(e);
        }}
        className={`${gerar ? "pr-28" : "pr-11"} ${className ?? ""}`}
      />
      <div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
        {gerar ? (
          <>
            <button
              type="button"
              title="Gerar senha forte"
              onClick={() => {
                setValor(gerarSenha());
                setVisivel(true);
              }}
              className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-gold"
            >
              <WandSparkles className="size-4" />
            </button>
            <button
              type="button"
              title="Copiar senha"
              disabled={!valor}
              onClick={() => {
                void navigator.clipboard.writeText(valor);
                setCopiado(true);
                setTimeout(() => setCopiado(false), 1500);
              }}
              className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-foreground disabled:opacity-40"
            >
              {copiado ? <Check className="size-4 text-green" /> : <Copy className="size-4" />}
            </button>
          </>
        ) : null}
        <button
          type="button"
          title={visivel ? "Ocultar senha" : "Mostrar senha"}
          aria-label={visivel ? "Ocultar senha" : "Mostrar senha"}
          onClick={() => setVisivel((v) => !v)}
          className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-foreground"
        >
          {visivel ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </div>
  );
}
