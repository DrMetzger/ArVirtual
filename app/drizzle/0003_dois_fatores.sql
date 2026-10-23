CREATE TABLE "codigos_verificacao" (
	"id" serial PRIMARY KEY NOT NULL,
	"usuario_id" uuid NOT NULL,
	"finalidade" text NOT NULL,
	"codigo_hash" text NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"tentativas" integer DEFAULT 0 NOT NULL,
	"usado_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "dois_fatores" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "codigos_verificacao" ADD CONSTRAINT "codigos_verificacao_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "codigos_verificacao_usuario_idx" ON "codigos_verificacao" USING btree ("usuario_id");