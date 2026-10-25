CREATE TABLE "movimentos_estoque" (
	"id" serial PRIMARY KEY NOT NULL,
	"produto_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"quantidade" integer NOT NULL,
	"saldo" integer NOT NULL,
	"origem" text DEFAULT '' NOT NULL,
	"observacao" text DEFAULT '' NOT NULL,
	"usuario_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pedidos_marketplace" ALTER COLUMN "conta_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pedidos_marketplace" ADD COLUMN "cliente_id" uuid;--> statement-breakpoint
ALTER TABLE "pedidos_marketplace" ADD COLUMN "desconto" numeric(14, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pedidos_marketplace" ADD COLUMN "observacoes" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "pedidos_marketplace" ADD COLUMN "estoque_baixado" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "produtos" ADD COLUMN "estoque_minimo" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "movimentos_estoque" ADD CONSTRAINT "movimentos_estoque_produto_id_produtos_id_fk" FOREIGN KEY ("produto_id") REFERENCES "public"."produtos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentos_estoque" ADD CONSTRAINT "movimentos_estoque_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "movimentos_estoque_produto_idx" ON "movimentos_estoque" USING btree ("produto_id","criado_em");--> statement-breakpoint
ALTER TABLE "pedidos_marketplace" ADD CONSTRAINT "pedidos_marketplace_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Pedidos importados antes do controle de estoque já estão refletidos no saldo atual: não baixam de novo.
UPDATE "pedidos_marketplace" SET "estoque_baixado" = true;--> statement-breakpoint
-- Numeração própria dos pedidos da loja (SL-000001, SL-000002...).
CREATE SEQUENCE IF NOT EXISTS "pedido_loja_seq";