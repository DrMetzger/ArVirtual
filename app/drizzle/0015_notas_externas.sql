CREATE TABLE "notas_externas" (
	"id" serial PRIMARY KEY NOT NULL,
	"pedido_id" integer NOT NULL,
	"origem" text NOT NULL,
	"chave" text NOT NULL,
	"numero" integer DEFAULT 0 NOT NULL,
	"serie" integer DEFAULT 0 NOT NULL,
	"cnpj_emitente" text DEFAULT '' NOT NULL,
	"emitida_em" timestamp with time zone,
	"valor" numeric(14, 2) DEFAULT 0 NOT NULL,
	"status" text DEFAULT '' NOT NULL,
	"xml" text DEFAULT '' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notas_externas" ADD CONSTRAINT "notas_externas_pedido_id_pedidos_marketplace_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos_marketplace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notas_externas_chave_idx" ON "notas_externas" USING btree ("chave");--> statement-breakpoint
CREATE INDEX "notas_externas_pedido_idx" ON "notas_externas" USING btree ("pedido_id");