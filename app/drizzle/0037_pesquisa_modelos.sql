CREATE TABLE "pesquisa_modelos_itens" (
	"id" serial PRIMARY KEY NOT NULL,
	"pesquisa_id" integer NOT NULL,
	"posicao" integer DEFAULT 0 NOT NULL,
	"modelo" jsonb NOT NULL,
	"detalhe" jsonb,
	"mercado" jsonb,
	"status" text DEFAULT 'pendente' NOT NULL,
	"erro" text DEFAULT '' NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pesquisas_modelos" (
	"id" serial PRIMARY KEY NOT NULL,
	"termo" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pesquisa_modelos_itens" ADD CONSTRAINT "pesquisa_modelos_itens_pesquisa_id_pesquisas_modelos_id_fk" FOREIGN KEY ("pesquisa_id") REFERENCES "public"."pesquisas_modelos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pesquisa_modelos_itens_pesquisa_idx" ON "pesquisa_modelos_itens" USING btree ("pesquisa_id");