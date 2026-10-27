CREATE TABLE "arquivos_produto" (
	"id" serial PRIMARY KEY NOT NULL,
	"produto_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"arquivo" text NOT NULL,
	"tamanho" integer NOT NULL,
	"observacao" text DEFAULT '' NOT NULL,
	"enviado_por" text DEFAULT '' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "arquivos_produto" ADD CONSTRAINT "arquivos_produto_produto_id_produtos_id_fk" FOREIGN KEY ("produto_id") REFERENCES "public"."produtos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "arquivos_produto_produto_idx" ON "arquivos_produto" USING btree ("produto_id");