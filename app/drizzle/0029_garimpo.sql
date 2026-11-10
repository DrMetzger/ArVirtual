CREATE TABLE "garimpo_itens" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"loja_id" text DEFAULT '' NOT NULL,
	"termo" text DEFAULT '' NOT NULL,
	"nome" text NOT NULL,
	"imagem" text DEFAULT '' NOT NULL,
	"link" text DEFAULT '' NOT NULL,
	"loja" text DEFAULT '' NOT NULL,
	"preco" numeric(14, 2) DEFAULT 0 NOT NULL,
	"comissao" double precision DEFAULT 0 NOT NULL,
	"vendas" integer DEFAULT 0 NOT NULL,
	"avaliacao" double precision DEFAULT 0 NOT NULL,
	"velocidade" double precision DEFAULT 0 NOT NULL,
	"extras" jsonb,
	"primeira_vez" timestamp with time zone DEFAULT now() NOT NULL,
	"visto_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "garimpo_itens_item_id_unique" UNIQUE("item_id")
);
--> statement-breakpoint
CREATE TABLE "garimpo_leituras" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"em" timestamp with time zone DEFAULT now() NOT NULL,
	"vendas" integer DEFAULT 0 NOT NULL,
	"preco" numeric(14, 2) DEFAULT 0 NOT NULL,
	"comissao" double precision DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "garimpo_termos" (
	"id" serial PRIMARY KEY NOT NULL,
	"termo" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"ultima_coleta" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "garimpo_termos_termo_unique" UNIQUE("termo")
);
--> statement-breakpoint
ALTER TABLE "garimpo_leituras" ADD CONSTRAINT "garimpo_leituras_item_id_garimpo_itens_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."garimpo_itens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "garimpo_itens_visto_idx" ON "garimpo_itens" USING btree ("visto_em");--> statement-breakpoint
CREATE INDEX "garimpo_leituras_item_idx" ON "garimpo_leituras" USING btree ("item_id","em");--> statement-breakpoint
INSERT INTO "garimpo_itens" ("item_id", "loja_id", "termo", "nome", "imagem", "link", "loja", "preco", "comissao", "vendas", "avaliacao", "velocidade", "extras", "primeira_vez", "visto_em")
SELECT "id_externo", "loja_id", CASE WHEN "termo" = 'em alta na Shopee' THEN 'em alta' ELSE "termo" END, "nome", "imagem", "link", "loja", "preco", "comissao", "vendas", "avaliacao", "velocidade", "extras", "primeira_vez", "visto_em"
FROM "sentinela_itens" WHERE "fonte" = 'shopee' AND "termo" = 'em alta na Shopee'
ON CONFLICT ("item_id") DO NOTHING;
--> statement-breakpoint
DELETE FROM "sentinela_itens" WHERE "termo" = 'em alta na Shopee';
