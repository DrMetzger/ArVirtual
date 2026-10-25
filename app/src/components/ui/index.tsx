import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

// ---------- Botões ----------
const buttonVariants = {
  primary: "bg-primary text-primary-fg hover:brightness-110 shadow-sm",
  gold: "bg-gold text-[#0a1a33] hover:brightness-110 shadow-sm",
  outline: "border border-border bg-surface text-foreground hover:border-gold hover:text-gold",
  ghost: "text-muted hover:bg-surface-2 hover:text-foreground",
  danger: "bg-red text-white hover:brightness-110",
} as const;
const buttonSizes = { sm: "h-8 px-3 text-xs", md: "h-10 px-4 text-sm", lg: "h-12 px-6 text-base", icon: "h-9 w-9" } as const;

export type ButtonVariant = keyof typeof buttonVariants;
export type ButtonSize = keyof typeof buttonSizes;

export function buttonClass(variant: ButtonVariant = "primary", size: keyof typeof buttonSizes = "md", className?: string) {
  return cn(
    "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl font-semibold transition-all",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:size-4",
    buttonVariants[variant],
    buttonSizes[size],
    className,
  );
}

export function Button({
  variant,
  size,
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: keyof typeof buttonSizes }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

// ---------- Formulários ----------
const fieldBase =
  "w-full rounded-xl border border-border bg-surface px-3.5 text-sm text-foreground placeholder:text-muted/60 transition-colors focus:border-transparent focus:outline-2 focus:outline-ring disabled:opacity-60";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(fieldBase, "h-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(fieldBase, "min-h-24 py-2.5", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(fieldBase, "h-10 pr-8", className)} {...props} />;
}

export function Field({
  label,
  hint,
  error,
  className,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn("grid gap-1.5", className)}>
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
      {children}
      {error ? <span className="text-xs text-red">{error}</span> : hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

// ---------- Layout ----------
export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-2xl border border-border bg-surface shadow-card", className)} {...props} />;
}

export function CardHeader({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
      <div>
        <h2 className="text-base font-bold">{title}</h2>
        {description ? <div className="mt-0.5 text-sm text-muted">{description}</div> : null}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-extrabold sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

const badgeTones = {
  neutral: "bg-surface-2 text-muted",
  blue: "bg-primary/12 text-primary",
  gold: "bg-gold/15 text-gold",
  red: "bg-red/12 text-red",
  green: "bg-green/12 text-green",
} as const;

export function Badge({ tone = "neutral", className, ...props }: ComponentProps<"span"> & { tone?: keyof typeof badgeTones }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", badgeTones[tone], className)}
      {...props}
    />
  );
}

export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <div className="grid size-14 place-items-center rounded-2xl bg-surface-2 text-gold [&_svg]:size-7">{icon}</div>
      <div>
        <p className="font-display font-bold">{title}</p>
        {description ? <p className="mt-1 max-w-md text-sm text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Alert({ tone = "red", children }: { tone?: "red" | "green" | "gold" | "blue"; children: ReactNode }) {
  const tones = {
    red: "border-red/30 bg-red/8 text-red",
    green: "border-green/30 bg-green/8 text-green",
    gold: "border-gold/30 bg-gold/8 text-gold",
    blue: "border-primary/30 bg-primary/8 text-primary",
  };
  return <div className={cn("rounded-xl border px-4 py-3 text-sm", tones[tone])}>{children}</div>;
}
