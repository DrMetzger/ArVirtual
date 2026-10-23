"use client";

import { Loader2, Moon, Sun } from "lucide-react";
import { startTransition, useActionState, useEffect, useState, type ComponentProps, type FormEvent } from "react";
import { useFormStatus } from "react-dom";
import { Button, type ButtonSize, type ButtonVariant } from "./index";

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
