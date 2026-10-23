CREATE TABLE "anuncios" (
	"id" serial PRIMARY KEY NOT NULL,
	"produto_id" uuid NOT NULL,
	"conta_id" integer NOT NULL,
	"marketplace" text NOT NULL,
	"id_externo" text,
	"link" text,
	"status" text NOT NULL,
	"preco" numeric(14, 2) NOT NULL,
	"mensagem" text DEFAULT '' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clientes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" text NOT NULL,
	"documento" text NOT NULL,
	"nome" text NOT NULL,
	"nome_fantasia" text DEFAULT '' NOT NULL,
	"inscricao_estadual" text DEFAULT '' NOT NULL,
	"indicador_ie" integer DEFAULT 9 NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"telefone" text DEFAULT '' NOT NULL,
	"situacao_cadastral" text DEFAULT '' NOT NULL,
	"dados_receita" jsonb,
	"observacoes" text DEFAULT '' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "configuracoes" (
	"chave" text PRIMARY KEY NOT NULL,
	"valor" text NOT NULL,
	"secreto" boolean DEFAULT false NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contas_email" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"host" text NOT NULL,
	"porta" integer DEFAULT 587 NOT NULL,
	"seguro" boolean DEFAULT false NOT NULL,
	"usuario" text NOT NULL,
	"senha_enc" text NOT NULL,
	"remetente_nome" text NOT NULL,
	"remetente_email" text NOT NULL,
	"padrao" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contas_marketplace" (
	"id" serial PRIMARY KEY NOT NULL,
	"marketplace" text NOT NULL,
	"nome" text NOT NULL,
	"id_externo" text NOT NULL,
	"access_token_enc" text NOT NULL,
	"refresh_token_enc" text DEFAULT '' NOT NULL,
	"expira_em" timestamp with time zone,
	"dados" jsonb,
	"ultima_sincronizacao" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "empresa" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"razao_social" text DEFAULT '' NOT NULL,
	"nome_fantasia" text DEFAULT '' NOT NULL,
	"cnpj" text DEFAULT '' NOT NULL,
	"inscricao_estadual" text DEFAULT '' NOT NULL,
	"inscricao_municipal" text DEFAULT '' NOT NULL,
	"regime" integer DEFAULT 1 NOT NULL,
	"cep" text DEFAULT '' NOT NULL,
	"logradouro" text DEFAULT '' NOT NULL,
	"numero" text DEFAULT '' NOT NULL,
	"complemento" text DEFAULT '' NOT NULL,
	"bairro" text DEFAULT '' NOT NULL,
	"cidade" text DEFAULT '' NOT NULL,
	"uf" text DEFAULT 'SP' NOT NULL,
	"codigo_ibge" text DEFAULT '' NOT NULL,
	"telefone" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enderecos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cliente_id" uuid NOT NULL,
	"apelido" text DEFAULT 'Principal' NOT NULL,
	"cep" text NOT NULL,
	"logradouro" text NOT NULL,
	"numero" text NOT NULL,
	"complemento" text DEFAULT '' NOT NULL,
	"bairro" text NOT NULL,
	"cidade" text NOT NULL,
	"uf" text NOT NULL,
	"codigo_ibge" text DEFAULT '' NOT NULL,
	"principal" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referencia" text NOT NULL,
	"cliente_id" uuid NOT NULL,
	"endereco_id" uuid,
	"status" text DEFAULT 'rascunho' NOT NULL,
	"ambiente" text DEFAULT 'homologacao' NOT NULL,
	"natureza_operacao" text NOT NULL,
	"numero" text,
	"serie" text,
	"chave" text,
	"danfe_url" text,
	"xml_url" text,
	"total_produtos" numeric(14, 2) DEFAULT 0 NOT NULL,
	"total_impostos" numeric(14, 2) DEFAULT 0 NOT NULL,
	"total_nota" numeric(14, 2) DEFAULT 0 NOT NULL,
	"itens" jsonb NOT NULL,
	"resposta" jsonb,
	"mensagem" text DEFAULT '' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notas_referencia_unique" UNIQUE("referencia")
);
--> statement-breakpoint
CREATE TABLE "pedidos_marketplace" (
	"id" serial PRIMARY KEY NOT NULL,
	"conta_id" integer NOT NULL,
	"marketplace" text NOT NULL,
	"id_externo" text NOT NULL,
	"status" text NOT NULL,
	"total" numeric(14, 2) DEFAULT 0 NOT NULL,
	"comprador" text DEFAULT '' NOT NULL,
	"data" timestamp with time zone NOT NULL,
	"dados" jsonb,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "produtos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sku" text NOT NULL,
	"nome" text NOT NULL,
	"descricao" text DEFAULT '' NOT NULL,
	"gtin" text DEFAULT '' NOT NULL,
	"ncm" text NOT NULL,
	"cest" text DEFAULT '' NOT NULL,
	"origem" integer DEFAULT 0 NOT NULL,
	"unidade" text DEFAULT 'UN' NOT NULL,
	"preco" numeric(14, 2) DEFAULT 0 NOT NULL,
	"custo" numeric(14, 2) DEFAULT 0 NOT NULL,
	"estoque" integer DEFAULT 0 NOT NULL,
	"peso_g" integer DEFAULT 0 NOT NULL,
	"altura_cm" numeric(8, 1) DEFAULT 0 NOT NULL,
	"largura_cm" numeric(8, 1) DEFAULT 0 NOT NULL,
	"comprimento_cm" numeric(8, 1) DEFAULT 0 NOT NULL,
	"material" text DEFAULT '' NOT NULL,
	"cor" text DEFAULT '' NOT NULL,
	"filamento_g" integer DEFAULT 0 NOT NULL,
	"tempo_impressao_min" integer DEFAULT 0 NOT NULL,
	"imagens" text[] DEFAULT '{}' NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regras_fiscais" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"prioridade" integer DEFAULT 0 NOT NULL,
	"ncm_prefixo" text DEFAULT '' NOT NULL,
	"uf_destino" text DEFAULT '' NOT NULL,
	"destinatario" text DEFAULT 'qualquer' NOT NULL,
	"natureza_operacao" text DEFAULT 'Venda de mercadoria' NOT NULL,
	"cfop_interno" text NOT NULL,
	"cfop_interestadual" text NOT NULL,
	"csosn" text DEFAULT '' NOT NULL,
	"cst_icms" text DEFAULT '' NOT NULL,
	"aliq_icms" numeric(7, 4) DEFAULT 0 NOT NULL,
	"cst_pis" text DEFAULT '49' NOT NULL,
	"aliq_pis" numeric(7, 4) DEFAULT 0 NOT NULL,
	"cst_cofins" text DEFAULT '49' NOT NULL,
	"aliq_cofins" numeric(7, 4) DEFAULT 0 NOT NULL,
	"cst_ipi" text DEFAULT '' NOT NULL,
	"aliq_ipi" numeric(7, 4) DEFAULT 0 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"senha_hash" text NOT NULL,
	"papel" text DEFAULT 'usuario' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "anuncios" ADD CONSTRAINT "anuncios_produto_id_produtos_id_fk" FOREIGN KEY ("produto_id") REFERENCES "public"."produtos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anuncios" ADD CONSTRAINT "anuncios_conta_id_contas_marketplace_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas_marketplace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enderecos" ADD CONSTRAINT "enderecos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notas" ADD CONSTRAINT "notas_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notas" ADD CONSTRAINT "notas_endereco_id_enderecos_id_fk" FOREIGN KEY ("endereco_id") REFERENCES "public"."enderecos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_marketplace" ADD CONSTRAINT "pedidos_marketplace_conta_id_contas_marketplace_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas_marketplace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "clientes_documento_idx" ON "clientes" USING btree ("documento");--> statement-breakpoint
CREATE INDEX "clientes_nome_idx" ON "clientes" USING btree ("nome");--> statement-breakpoint
CREATE UNIQUE INDEX "contas_marketplace_ext_idx" ON "contas_marketplace" USING btree ("marketplace","id_externo");--> statement-breakpoint
CREATE INDEX "enderecos_cliente_idx" ON "enderecos" USING btree ("cliente_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pedidos_marketplace_ext_idx" ON "pedidos_marketplace" USING btree ("marketplace","id_externo");--> statement-breakpoint
CREATE INDEX "pedidos_marketplace_data_idx" ON "pedidos_marketplace" USING btree ("data");--> statement-breakpoint
CREATE UNIQUE INDEX "produtos_sku_idx" ON "produtos" USING btree ("sku");