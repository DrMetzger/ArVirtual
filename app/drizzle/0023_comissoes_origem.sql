ALTER TABLE "afiliados_comissoes" ADD COLUMN "shop_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "afiliados_comissoes" ADD COLUMN "origem" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "afiliados_comissoes" ADD COLUMN "atribuicao" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "afiliados_comissoes" ADD COLUMN "comissao_vendedor" numeric(14, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "afiliados_comissoes" ADD COLUMN "reembolso" numeric(14, 2) DEFAULT 0 NOT NULL;