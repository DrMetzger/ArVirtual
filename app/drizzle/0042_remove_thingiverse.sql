-- Pedido do usuário: o Thingiverse saiu da pesquisa de modelos 3D (bloqueia servidores e trazia modelos sem relação).
DELETE FROM "pesquisa_modelos_itens" WHERE "modelo"->>'fonte' = 'thingiverse';
--> statement-breakpoint
UPDATE "pesquisas_modelos" SET "fontes" = "fontes" - 'thingiverse' WHERE "fontes" ? 'thingiverse';
--> statement-breakpoint
DELETE FROM "configuracoes" WHERE "chave" = 'thingiverse.token';
