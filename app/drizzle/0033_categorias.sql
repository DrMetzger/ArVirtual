CREATE TABLE "categorias" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categorias_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
ALTER TABLE "produtos" ADD COLUMN "categoria_id" integer;--> statement-breakpoint
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
INSERT INTO "categorias" ("nome", "ordem") VALUES ('Acessórios Automotivo', 1), ('Acessórios Drones', 2), ('Acessórios para Consoles e Setup', 3), ('Action Figures e Colecionáveis', 4), ('Bar e Resenha', 5), ('Confeitaria e Modelagem', 6), ('Datas Comemorativas - Sazonal', 7), ('Decoração e Arte', 8), ('Escritório e Organização', 9), ('Facebook', 10), ('Jogos e Tabuleiro', 11), ('Projeto Marea', 12), ('Religiosidade', 13), ('Utilidades Domésticas', 14)
ON CONFLICT ("nome") DO NOTHING;
