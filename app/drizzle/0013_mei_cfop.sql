-- MEI (CRT 4): a SEFAZ rejeita (337) venda fora de 5102/6102 com CSOSN 102. Corrige as regras de venda já salvas.
UPDATE "regras_fiscais" SET "cfop_interno" = '5102', "cfop_interestadual" = '6102', "csosn" = '102'
WHERE EXISTS (SELECT 1 FROM "empresa" WHERE "regime" = 4)
  AND ("cfop_interno" ~ '^5[14][0-9]{2}$' OR "cfop_interestadual" ~ '^6[14][0-9]{2}$')
  AND ("cfop_interno" <> '5102' OR "cfop_interestadual" <> '6102' OR "csosn" NOT IN ('102', '103', '300'));
