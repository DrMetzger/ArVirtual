CREATE TABLE "contas_caixa" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"saldo_inicial" numeric(14, 2) DEFAULT 0 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lancamentos" (
	"id" serial PRIMARY KEY NOT NULL,
	"tipo" text NOT NULL,
	"descricao" text NOT NULL,
	"categoria" text DEFAULT '' NOT NULL,
	"valor" numeric(14, 2) NOT NULL,
	"vencimento" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'aberto' NOT NULL,
	"pago_em" timestamp with time zone,
	"valor_pago" numeric(14, 2),
	"conta_caixa_id" integer,
	"forma_pagamento" text DEFAULT '' NOT NULL,
	"parcela" text DEFAULT '' NOT NULL,
	"origem" text DEFAULT '' NOT NULL,
	"cliente_id" uuid,
	"fornecedor_id" uuid,
	"observacoes" text DEFAULT '' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pedidos_marketplace" ADD COLUMN "financeiro_gerado" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_conta_caixa_id_contas_caixa_id_fk" FOREIGN KEY ("conta_caixa_id") REFERENCES "public"."contas_caixa"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_fornecedor_id_fornecedores_id_fk" FOREIGN KEY ("fornecedor_id") REFERENCES "public"."fornecedores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lancamentos_tipo_venc_idx" ON "lancamentos" USING btree ("tipo","status","vencimento");--> statement-breakpoint
CREATE INDEX "lancamentos_origem_idx" ON "lancamentos" USING btree ("origem");--> statement-breakpoint
-- Pedidos de antes do financeiro já foram recebidos: não geram título.
UPDATE "pedidos_marketplace" SET "financeiro_gerado" = true;--> statement-breakpoint
INSERT INTO "contas_caixa" ("nome") VALUES ('Caixa');