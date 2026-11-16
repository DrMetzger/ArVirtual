CREATE TABLE "raiox_anuncios" (
	"conta_id" integer NOT NULL,
	"marketplace" text NOT NULL,
	"id_externo" text NOT NULL,
	"titulo" text DEFAULT '' NOT NULL,
	"imagem" text DEFAULT '' NOT NULL,
	"link" text DEFAULT '' NOT NULL,
	"preco" numeric(14, 2) DEFAULT 0 NOT NULL,
	"status" text DEFAULT '' NOT NULL,
	"visitas" integer,
	"periodo" text DEFAULT '' NOT NULL,
	"vendas30" integer DEFAULT 0 NOT NULL,
	"faturamento30" numeric(14, 2) DEFAULT 0 NOT NULL,
	"vendas_total" integer,
	"fotos" integer,
	"premium" boolean,
	"frete_gratis" boolean,
	"qualidade" jsonb,
	"plano_ia" text DEFAULT '' NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "raiox_anuncios" ADD CONSTRAINT "raiox_anuncios_conta_id_contas_marketplace_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas_marketplace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "raiox_anuncios_idx" ON "raiox_anuncios" USING btree ("conta_id","id_externo");