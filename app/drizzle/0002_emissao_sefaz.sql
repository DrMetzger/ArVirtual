CREATE TABLE "eventos_nfe" (
	"id" serial PRIMARY KEY NOT NULL,
	"nota_id" uuid,
	"tipo" text NOT NULL,
	"ambiente" text NOT NULL,
	"servico" text DEFAULT '' NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"requisicao" text,
	"resposta" text,
	"codigo" text,
	"mensagem" text DEFAULT '' NOT NULL,
	"protocolo" text,
	"sucesso" boolean DEFAULT false NOT NULL,
	"sequencia" integer,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ncms" (
	"codigo" text PRIMARY KEY NOT NULL,
	"descricao" text NOT NULL,
	"aliquota_ipi" numeric(6, 2),
	"aliquota_aproximada" numeric(6, 2),
	"pendente" boolean DEFAULT true NOT NULL,
	"fonte" text DEFAULT 'auto' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uf_icms" (
	"uf" text PRIMARY KEY NOT NULL,
	"aliquota_interna" numeric(5, 2) NOT NULL,
	"aliquota_fcp" numeric(5, 2) DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notas" DROP CONSTRAINT "notas_referencia_unique";--> statement-breakpoint
ALTER TABLE "notas" ALTER COLUMN "numero" SET DATA TYPE integer USING nullif(regexp_replace("numero", '\D', '', 'g'), '')::integer;--> statement-breakpoint
ALTER TABLE "notas" ALTER COLUMN "serie" SET DATA TYPE integer USING nullif(regexp_replace("serie", '\D', '', 'g'), '')::integer;--> statement-breakpoint
ALTER TABLE "empresa" ADD COLUMN "ambiente_nfe" text DEFAULT 'homologacao' NOT NULL;--> statement-breakpoint
ALTER TABLE "empresa" ADD COLUMN "serie_nfe" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "empresa" ADD COLUMN "proximo_numero_nfe" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "empresa" ADD COLUMN "aliquota_credito_sn" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "notas" ADD COLUMN "forma_pagamento" text DEFAULT '99' NOT NULL;--> statement-breakpoint
ALTER TABLE "notas" ADD COLUMN "protocolo" text;--> statement-breakpoint
ALTER TABLE "notas" ADD COLUMN "codigo_sefaz" text;--> statement-breakpoint
ALTER TABLE "notas" ADD COLUMN "xml" text;--> statement-breakpoint
ALTER TABLE "notas" ADD COLUMN "xml_proc" text;--> statement-breakpoint
ALTER TABLE "notas" ADD COLUMN "emitida_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notas" ADD COLUMN "autorizada_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "eventos_nfe" ADD CONSTRAINT "eventos_nfe_nota_id_notas_id_fk" FOREIGN KEY ("nota_id") REFERENCES "public"."notas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eventos_nfe_nota_idx" ON "eventos_nfe" USING btree ("nota_id");--> statement-breakpoint
ALTER TABLE "certificado_digital" DROP COLUMN "enviado_focus_em";--> statement-breakpoint
ALTER TABLE "certificado_digital" DROP COLUMN "mensagem_focus";--> statement-breakpoint
ALTER TABLE "notas" DROP COLUMN "referencia";--> statement-breakpoint
ALTER TABLE "notas" DROP COLUMN "danfe_url";--> statement-breakpoint
ALTER TABLE "notas" DROP COLUMN "xml_url";--> statement-breakpoint
ALTER TABLE "notas" DROP COLUMN "resposta";--> statement-breakpoint
-- ICMS interno e FCP por UF (valores de referência do ERP Vanguard: conferir)
INSERT INTO "uf_icms" ("uf", "aliquota_interna", "aliquota_fcp") VALUES ('AC', 19, 0), ('AL', 19, 1), ('AM', 20, 0), ('AP', 18, 0), ('BA', 19.5, 1), ('CE', 20, 0), ('DF', 20, 0), ('ES', 17, 0), ('GO', 19, 0), ('MA', 23, 0), ('MG', 18, 0), ('MS', 17, 0), ('MT', 17, 0), ('PA', 19, 0), ('PB', 20, 0), ('PE', 20.5, 0), ('PI', 22.5, 0), ('PR', 19.5, 0), ('RJ', 20, 2), ('RN', 20, 0), ('RO', 19.5, 0), ('RR', 20, 0), ('RS', 17, 0), ('SC', 17, 0), ('SE', 19, 1), ('SP', 18, 0), ('TO', 20, 0) ON CONFLICT DO NOTHING;--> statement-breakpoint
-- Notas do fluxo antigo (Focus) que ficaram "processando" voltam a rascunho para a emissão própria
UPDATE "notas" SET "status" = 'rascunho' WHERE "status" = 'processando';
