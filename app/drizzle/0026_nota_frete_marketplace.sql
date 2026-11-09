ALTER TABLE "notas" ADD COLUMN "frete" numeric(14, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "notas" ADD COLUMN "desconto" numeric(14, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "notas" ADD COLUMN "envio_marketplace" text DEFAULT '' NOT NULL;