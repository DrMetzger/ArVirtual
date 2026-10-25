CREATE TABLE "conversas_ia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"titulo" text DEFAULT 'Nova conversa' NOT NULL,
	"pasta" text DEFAULT '' NOT NULL,
	"fixada" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memorias_ia" (
	"id" serial PRIMARY KEY NOT NULL,
	"texto" text NOT NULL,
	"conversa_id" uuid,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mensagens_ia" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversa_id" uuid NOT NULL,
	"papel" text NOT NULL,
	"texto" text DEFAULT '' NOT NULL,
	"anexos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fontes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"modelo" text DEFAULT '' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversas_ia" ADD CONSTRAINT "conversas_ia_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memorias_ia" ADD CONSTRAINT "memorias_ia_conversa_id_conversas_ia_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."conversas_ia"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens_ia" ADD CONSTRAINT "mensagens_ia_conversa_id_conversas_ia_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."conversas_ia"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversas_ia_usuario_idx" ON "conversas_ia" USING btree ("usuario_id","atualizado_em");--> statement-breakpoint
CREATE INDEX "mensagens_ia_conversa_idx" ON "mensagens_ia" USING btree ("conversa_id","id");