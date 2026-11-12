CREATE TABLE "anuncios_plataforma" (
	"conta_id" integer PRIMARY KEY NOT NULL,
	"marketplace" text NOT NULL,
	"ativos" integer DEFAULT 0 NOT NULL,
	"pausados" integer DEFAULT 0 NOT NULL,
	"outros" integer DEFAULT 0 NOT NULL,
	"erro" text DEFAULT '' NOT NULL,
	"em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "anuncios_plataforma" ADD CONSTRAINT "anuncios_plataforma_conta_id_contas_marketplace_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas_marketplace"("id") ON DELETE cascade ON UPDATE no action;