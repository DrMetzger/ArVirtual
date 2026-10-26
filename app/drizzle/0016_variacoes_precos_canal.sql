ALTER TABLE "produtos" ADD COLUMN "tem_variacoes" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "produtos" ADD COLUMN "pai_id" uuid;--> statement-breakpoint
ALTER TABLE "produtos" ADD COLUMN "atributos" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "produtos" ADD COLUMN "precos_canal" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_pai_id_produtos_id_fk" FOREIGN KEY ("pai_id") REFERENCES "public"."produtos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "produtos_pai_idx" ON "produtos" USING btree ("pai_id");