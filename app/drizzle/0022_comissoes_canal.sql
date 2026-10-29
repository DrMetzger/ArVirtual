ALTER TABLE "afiliados_comissoes" ADD COLUMN "canal" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "afiliados_comissoes" ADD COLUMN "comprador_tipo" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "afiliados_comissoes" ADD COLUMN "dispositivo" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "afiliados_comissoes" ADD COLUMN "imagem" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "afiliados_comissoes" ADD COLUMN "clicado_em" timestamp with time zone;