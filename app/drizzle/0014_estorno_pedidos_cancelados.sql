-- Pedidos da loja própria cancelados antes desta correção deixaram o título recebido no caixa: estorna.
UPDATE "lancamentos" l SET "status" = 'cancelado', "observacoes" = trim(l."observacoes" || ' Estornado: pedido cancelado.'), "atualizado_em" = now()
FROM "pedidos_marketplace" p
WHERE l."origem" = 'pedido:' || p."id" AND p."marketplace" = 'loja' AND p."status" = 'cancelado' AND l."status" IN ('aberto', 'pago');
--> statement-breakpoint
UPDATE "pedidos_marketplace" SET "financeiro_gerado" = false WHERE "marketplace" = 'loja' AND "status" = 'cancelado';
