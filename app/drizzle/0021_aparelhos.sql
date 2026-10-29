CREATE TABLE "aparelhos" (
	"id" text PRIMARY KEY NOT NULL,
	"usuario_id" uuid,
	"usuario_nome" text DEFAULT '' NOT NULL,
	"fabricante" text DEFAULT '' NOT NULL,
	"modelo" text DEFAULT '' NOT NULL,
	"android" text DEFAULT '' NOT NULL,
	"versao_app" text DEFAULT '' NOT NULL,
	"bateria" integer,
	"carregando" boolean DEFAULT false NOT NULL,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"precisao_m" integer,
	"localizado_em" timestamp with time zone,
	"notificacoes" boolean DEFAULT false NOT NULL,
	"ip" text DEFAULT '' NOT NULL,
	"ultimo_acesso" timestamp with time zone DEFAULT now() NOT NULL,
	"bloqueado" boolean DEFAULT false NOT NULL,
	"bloqueado_em" timestamp with time zone,
	"bloqueado_por" text DEFAULT '' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "aparelhos" ADD CONSTRAINT "aparelhos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;