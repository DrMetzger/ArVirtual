ALTER TABLE "produtos" ADD COLUMN "composicao" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
-- Produtos que já tinham um filamento: a composição começa com ele.
UPDATE "produtos" SET "composicao" = jsonb_build_array(jsonb_build_object('filamentoId', "filamento_id", 'gramas', "filamento_g")) WHERE "filamento_id" IS NOT NULL OR "filamento_g" > 0;
