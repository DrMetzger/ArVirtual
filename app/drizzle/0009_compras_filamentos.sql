CREATE TABLE "filamentos" (
	"id" serial PRIMARY KEY NOT NULL,
	"material" text NOT NULL,
	"cor" text NOT NULL,
	"cor_hex" text DEFAULT '#888888' NOT NULL,
	"marca" text DEFAULT '' NOT NULL,
	"custo_kg" numeric(14, 2) DEFAULT 0 NOT NULL,
	"saldo_g" integer DEFAULT 0 NOT NULL,
	"minimo_g" integer DEFAULT 0 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fornecedores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" text NOT NULL,
	"documento" text NOT NULL,
	"nome" text NOT NULL,
	"nome_fantasia" text DEFAULT '' NOT NULL,
	"inscricao_estadual" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"telefone" text DEFAULT '' NOT NULL,
	"cidade" text DEFAULT '' NOT NULL,
	"uf" text DEFAULT '' NOT NULL,
	"observacoes" text DEFAULT '' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "itens_nota_entrada" (
	"id" serial PRIMARY KEY NOT NULL,
	"nota_id" integer NOT NULL,
	"codigo" text DEFAULT '' NOT NULL,
	"descricao" text NOT NULL,
	"ncm" text DEFAULT '' NOT NULL,
	"cfop" text DEFAULT '' NOT NULL,
	"unidade" text DEFAULT 'UN' NOT NULL,
	"quantidade" numeric(14, 4) NOT NULL,
	"valor_unitario" numeric(14, 4) NOT NULL,
	"valor_total" numeric(14, 2) NOT NULL,
	"destino" text DEFAULT 'despesa' NOT NULL,
	"filamento_id" integer,
	"produto_id" uuid,
	"gramas_por_unidade" integer DEFAULT 1000 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "movimentos_filamento" (
	"id" serial PRIMARY KEY NOT NULL,
	"filamento_id" integer NOT NULL,
	"tipo" text NOT NULL,
	"gramas" integer NOT NULL,
	"saldo_g" integer NOT NULL,
	"custo_kg" numeric(14, 2) DEFAULT 0 NOT NULL,
	"origem" text DEFAULT '' NOT NULL,
	"observacao" text DEFAULT '' NOT NULL,
	"usuario_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notas_entrada" (
	"id" serial PRIMARY KEY NOT NULL,
	"fornecedor_id" uuid,
	"numero" text DEFAULT '' NOT NULL,
	"serie" text DEFAULT '' NOT NULL,
	"chave" text,
	"emissao" timestamp with time zone,
	"entrada" timestamp with time zone DEFAULT now() NOT NULL,
	"valor_produtos" numeric(14, 2) DEFAULT 0 NOT NULL,
	"frete" numeric(14, 2) DEFAULT 0 NOT NULL,
	"outras" numeric(14, 2) DEFAULT 0 NOT NULL,
	"desconto" numeric(14, 2) DEFAULT 0 NOT NULL,
	"valor_total" numeric(14, 2) DEFAULT 0 NOT NULL,
	"parcelas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'rascunho' NOT NULL,
	"xml" text,
	"observacoes" text DEFAULT '' NOT NULL,
	"lancada_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "producoes" (
	"id" serial PRIMARY KEY NOT NULL,
	"produto_id" uuid NOT NULL,
	"filamento_id" integer,
	"quantidade" integer NOT NULL,
	"gramas" integer NOT NULL,
	"perda_g" integer DEFAULT 0 NOT NULL,
	"tempo_min" integer DEFAULT 0 NOT NULL,
	"observacao" text DEFAULT '' NOT NULL,
	"usuario_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "produtos" ADD COLUMN "filamento_id" integer;--> statement-breakpoint
ALTER TABLE "itens_nota_entrada" ADD CONSTRAINT "itens_nota_entrada_nota_id_notas_entrada_id_fk" FOREIGN KEY ("nota_id") REFERENCES "public"."notas_entrada"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itens_nota_entrada" ADD CONSTRAINT "itens_nota_entrada_filamento_id_filamentos_id_fk" FOREIGN KEY ("filamento_id") REFERENCES "public"."filamentos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itens_nota_entrada" ADD CONSTRAINT "itens_nota_entrada_produto_id_produtos_id_fk" FOREIGN KEY ("produto_id") REFERENCES "public"."produtos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentos_filamento" ADD CONSTRAINT "movimentos_filamento_filamento_id_filamentos_id_fk" FOREIGN KEY ("filamento_id") REFERENCES "public"."filamentos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentos_filamento" ADD CONSTRAINT "movimentos_filamento_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notas_entrada" ADD CONSTRAINT "notas_entrada_fornecedor_id_fornecedores_id_fk" FOREIGN KEY ("fornecedor_id") REFERENCES "public"."fornecedores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "producoes" ADD CONSTRAINT "producoes_produto_id_produtos_id_fk" FOREIGN KEY ("produto_id") REFERENCES "public"."produtos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "producoes" ADD CONSTRAINT "producoes_filamento_id_filamentos_id_fk" FOREIGN KEY ("filamento_id") REFERENCES "public"."filamentos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "producoes" ADD CONSTRAINT "producoes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "filamentos_material_cor_marca_idx" ON "filamentos" USING btree ("material","cor","marca");--> statement-breakpoint
CREATE UNIQUE INDEX "fornecedores_documento_idx" ON "fornecedores" USING btree ("documento");--> statement-breakpoint
CREATE INDEX "movimentos_filamento_idx" ON "movimentos_filamento" USING btree ("filamento_id","criado_em");--> statement-breakpoint
CREATE UNIQUE INDEX "notas_entrada_chave_idx" ON "notas_entrada" USING btree ("chave");