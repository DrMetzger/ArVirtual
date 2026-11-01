ALTER TABLE "anuncios" ADD COLUMN "visitas" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "anuncios" ADD COLUMN "curtidas" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "anuncios" ADD COLUMN "metricas_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pedidos_marketplace" ADD COLUMN "taxas" numeric(14, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pedidos_marketplace" ADD COLUMN "frete_vendedor" numeric(14, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pedidos_marketplace" ADD COLUMN "taxas_final" boolean DEFAULT false NOT NULL;