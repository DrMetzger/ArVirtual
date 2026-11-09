CREATE TABLE "sentinela_itens" (
	"id" serial PRIMARY KEY NOT NULL,
	"fonte" text NOT NULL,
	"id_externo" text NOT NULL,
	"loja_id" text DEFAULT '' NOT NULL,
	"termo" text DEFAULT '' NOT NULL,
	"nome" text NOT NULL,
	"imagem" text DEFAULT '' NOT NULL,
	"link" text DEFAULT '' NOT NULL,
	"loja" text DEFAULT '' NOT NULL,
	"categoria" text DEFAULT '' NOT NULL,
	"preco" numeric(14, 2) DEFAULT 0 NOT NULL,
	"comissao" double precision DEFAULT 0 NOT NULL,
	"vendas" integer DEFAULT 0 NOT NULL,
	"avaliacao" double precision DEFAULT 0 NOT NULL,
	"posicao" integer,
	"vendedores" integer,
	"velocidade" double precision DEFAULT 0 NOT NULL,
	"analise" jsonb,
	"primeira_vez" timestamp with time zone DEFAULT now() NOT NULL,
	"visto_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sentinela_leituras" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"em" timestamp with time zone DEFAULT now() NOT NULL,
	"vendas" integer DEFAULT 0 NOT NULL,
	"preco" numeric(14, 2) DEFAULT 0 NOT NULL,
	"posicao" integer,
	"vendedores" integer
);
--> statement-breakpoint
CREATE TABLE "sentinela_relatorios" (
	"id" serial PRIMARY KEY NOT NULL,
	"texto" text NOT NULL,
	"fontes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sentinela_termos" (
	"id" serial PRIMARY KEY NOT NULL,
	"termo" text NOT NULL,
	"origem" text DEFAULT 'usuario' NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"motivo" text DEFAULT '' NOT NULL,
	"ultima_coleta" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sentinela_termos_termo_unique" UNIQUE("termo")
);
--> statement-breakpoint
ALTER TABLE "sentinela_leituras" ADD CONSTRAINT "sentinela_leituras_item_id_sentinela_itens_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."sentinela_itens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sentinela_itens_ext_idx" ON "sentinela_itens" USING btree ("fonte","id_externo");--> statement-breakpoint
CREATE INDEX "sentinela_itens_vel_idx" ON "sentinela_itens" USING btree ("velocidade");--> statement-breakpoint
CREATE INDEX "sentinela_leituras_item_idx" ON "sentinela_leituras" USING btree ("item_id","em");--> statement-breakpoint
INSERT INTO "sentinela_termos" ("termo", "origem") VALUES
('suporte controle', 'padrao'), ('suporte headset', 'padrao'), ('suporte celular mesa', 'padrao'), ('organizador de mesa', 'padrao'),
('porta canetas', 'padrao'), ('vaso decorativo', 'padrao'), ('luminaria 3d', 'padrao'), ('chaveiro personalizado', 'padrao'),
('action figure', 'padrao'), ('miniatura decorativa', 'padrao'), ('enfeite de natal', 'padrao'), ('presepio', 'padrao'),
('porta copos', 'padrao'), ('dragao articulado', 'padrao'), ('topo de bolo', 'padrao'), ('suporte alexa', 'padrao'),
('suporte notebook', 'padrao'), ('gancho parede', 'padrao'), ('cofrinho', 'padrao'), ('impressao 3d', 'padrao'),
('suporte fone', 'padrao'), ('porta controle remoto', 'padrao'), ('decoracao gamer', 'padrao'), ('vaso planta', 'padrao')
ON CONFLICT ("termo") DO NOTHING;
