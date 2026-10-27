CREATE TABLE "afiliados_comissoes" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversion_id" text NOT NULL,
	"order_id" text NOT NULL,
	"item_id" text NOT NULL,
	"item_nome" text DEFAULT '' NOT NULL,
	"loja" text DEFAULT '' NOT NULL,
	"quantidade" integer DEFAULT 1 NOT NULL,
	"valor" numeric(14, 2) DEFAULT 0 NOT NULL,
	"comissao" numeric(14, 2) DEFAULT 0 NOT NULL,
	"status" text DEFAULT '' NOT NULL,
	"sub_id" text DEFAULT '' NOT NULL,
	"compra_em" timestamp with time zone,
	"dados" jsonb,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "afiliados_produtos" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"shop_id" text NOT NULL,
	"nome" text NOT NULL,
	"imagem" text DEFAULT '' NOT NULL,
	"loja" text DEFAULT '' NOT NULL,
	"preco" numeric(14, 2) DEFAULT 0 NOT NULL,
	"comissao_taxa" numeric(8, 4) DEFAULT 0 NOT NULL,
	"comissao_valor" numeric(14, 2) DEFAULT 0 NOT NULL,
	"vendas" integer DEFAULT 0 NOT NULL,
	"avaliacao" numeric(3, 2) DEFAULT 0 NOT NULL,
	"link_produto" text DEFAULT '' NOT NULL,
	"link_afiliado" text DEFAULT '' NOT NULL,
	"sub_id" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'ideia' NOT NULL,
	"observacao" text DEFAULT '' NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "afiliados_videos" (
	"id" serial PRIMARY KEY NOT NULL,
	"produto_id" integer,
	"titulo" text DEFAULT '' NOT NULL,
	"origem" text DEFAULT 'proprio' NOT NULL,
	"url_origem" text DEFAULT '' NOT NULL,
	"autorizacao" text DEFAULT '' NOT NULL,
	"arquivo" text DEFAULT '' NOT NULL,
	"tamanho" integer DEFAULT 0 NOT NULL,
	"duracao_s" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'bruto' NOT NULL,
	"erro" text DEFAULT '' NOT NULL,
	"observacao" text DEFAULT '' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "afiliados_videos" ADD CONSTRAINT "afiliados_videos_produto_id_afiliados_produtos_id_fk" FOREIGN KEY ("produto_id") REFERENCES "public"."afiliados_produtos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "afiliados_comissoes_item_idx" ON "afiliados_comissoes" USING btree ("conversion_id","order_id","item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "afiliados_produtos_item_idx" ON "afiliados_produtos" USING btree ("shop_id","item_id");--> statement-breakpoint
CREATE INDEX "afiliados_videos_produto_idx" ON "afiliados_videos" USING btree ("produto_id");