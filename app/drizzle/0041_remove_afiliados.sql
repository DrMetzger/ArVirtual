-- Pedido do usuário: a parte de Afiliados Shopee saiu do ERP. Apaga os dados dela (produtos de afiliado, comissões e
-- garimpo). Os vídeos baixados continuam na galeria, só sem o produto de afiliado.
DELETE FROM "afiliados_comissoes";
--> statement-breakpoint
DELETE FROM "garimpo_leituras";
--> statement-breakpoint
DELETE FROM "garimpo_itens";
--> statement-breakpoint
DELETE FROM "garimpo_termos";
--> statement-breakpoint
UPDATE "afiliados_videos" SET "produto_id" = NULL WHERE "produto_id" IS NOT NULL;
--> statement-breakpoint
DELETE FROM "afiliados_produtos";
