CREATE TABLE "vinculos_sku" (
	"id" serial PRIMARY KEY NOT NULL,
	"canal" text NOT NULL,
	"chave" text NOT NULL,
	"produto_id" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vinculos_sku" ADD CONSTRAINT "vinculos_sku_produto_id_produtos_id_fk" FOREIGN KEY ("produto_id") REFERENCES "public"."produtos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "vinculos_sku_canal_chave_idx" ON "vinculos_sku" USING btree ("canal","chave");