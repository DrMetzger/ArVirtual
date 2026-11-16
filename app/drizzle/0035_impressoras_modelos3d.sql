CREATE TABLE "impressoras" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"modelo" text DEFAULT '' NOT NULL,
	"largura_mm" integer NOT NULL,
	"profundidade_mm" integer NOT NULL,
	"altura_mm" integer NOT NULL,
	"cores" integer DEFAULT 1 NOT NULL,
	"bico_mm" numeric(3, 2) DEFAULT 0.4 NOT NULL,
	"materiais" text DEFAULT 'PLA, PETG' NOT NULL,
	"potencia_w" integer DEFAULT 95 NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "produtos" ADD COLUMN "modelo3d" jsonb;--> statement-breakpoint
-- Primeira(s) impressora(s) a partir do que já estava em Configurações (modelo e quantidade); padrão: A1 mini.
INSERT INTO "impressoras" ("nome", "modelo", "largura_mm", "profundidade_mm", "altura_mm", "cores", "potencia_w")
SELECT
  m.modelo || CASE WHEN q.n > 1 THEN ' #' || g ELSE '' END,
  m.modelo,
  CASE m.modelo WHEN 'Bambu Lab A1 mini' THEN 180 WHEN 'Bambu Lab H2D' THEN 325 ELSE 256 END,
  CASE m.modelo WHEN 'Bambu Lab A1 mini' THEN 180 WHEN 'Bambu Lab H2D' THEN 320 ELSE 256 END,
  CASE m.modelo WHEN 'Bambu Lab A1 mini' THEN 180 WHEN 'Bambu Lab H2D' THEN 325 ELSE 256 END,
  CASE WHEN coalesce((SELECT "valor" FROM "configuracoes" WHERE "chave" = 'impressora.ams'), '') LIKE 'Sem AMS%' THEN 1 ELSE 4 END,
  coalesce((SELECT round(replace("valor", ',', '.')::numeric)::int FROM "configuracoes" WHERE "chave" = 'impressao.potenciaW' AND "valor" ~ '^[0-9]+([.,][0-9]+)?$'), 95)
FROM
  (SELECT coalesce(nullif((SELECT "valor" FROM "configuracoes" WHERE "chave" = 'impressora.modelo'), ''), 'Bambu Lab A1 mini') AS modelo) m,
  (SELECT greatest(1, least(20, coalesce((SELECT "valor"::int FROM "configuracoes" WHERE "chave" = 'impressora.quantidade' AND "valor" ~ '^[0-9]+$'), 1))) AS n) q,
  generate_series(1, (SELECT greatest(1, least(20, coalesce((SELECT "valor"::int FROM "configuracoes" WHERE "chave" = 'impressora.quantidade' AND "valor" ~ '^[0-9]+$'), 1))))) g
WHERE NOT EXISTS (SELECT 1 FROM "impressoras");
