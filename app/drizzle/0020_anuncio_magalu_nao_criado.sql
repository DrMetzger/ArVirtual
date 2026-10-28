-- O Magalu aceitou o envio do SKU SUP-PS5001-C mas não criou o cadastro: o histórico dizia "publicado" sem existir lá.
UPDATE "anuncios" SET "status" = 'erro', "mensagem" = 'O Magalu recebeu o produto mas não criou o cadastro (provável anúncio igual a outro da loja: SPRTGTA).'
WHERE "marketplace" = 'magalu' AND "id_externo" = 'SUP-PS5001-C' AND "status" = 'publicado';
