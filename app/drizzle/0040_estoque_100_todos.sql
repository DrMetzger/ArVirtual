-- Pedido do usuário: todos os produtos com 100 em estoque (os trazidos dos marketplaces vieram zerados).
-- Lançado no kardex como ajuste (a diferença até 100), só nos itens que têm estoque próprio
-- (produto sem variações e cada variação; o produto com variações soma as dele).
INSERT INTO "movimentos_estoque" ("produto_id", "tipo", "quantidade", "saldo", "origem", "observacao")
SELECT "id", 'ajuste', 100 - "estoque", 100, 'ajuste:estoque-100', 'Estoque ajustado para 100 em todos os produtos'
FROM "produtos"
WHERE "tem_variacoes" = false AND "estoque" <> 100;
--> statement-breakpoint
UPDATE "produtos" SET "estoque" = 100, "atualizado_em" = now() WHERE "tem_variacoes" = false AND "estoque" <> 100;
