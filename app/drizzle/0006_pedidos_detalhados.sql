ALTER TABLE "pedidos_marketplace" ADD COLUMN "frete" numeric(14, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pedidos_marketplace" ADD COLUMN "itens" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "pedidos_marketplace" ADD COLUMN "entrega" jsonb;--> statement-breakpoint
ALTER TABLE "pedidos_marketplace" ADD COLUMN "nota_id" uuid;--> statement-breakpoint
ALTER TABLE "pedidos_marketplace" ADD CONSTRAINT "pedidos_marketplace_nota_id_notas_id_fk" FOREIGN KEY ("nota_id") REFERENCES "public"."notas"("id") ON DELETE set null ON UPDATE no action;