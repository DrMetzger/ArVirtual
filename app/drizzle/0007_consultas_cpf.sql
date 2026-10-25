CREATE TABLE "consultas_cpf" (
	"id" serial PRIMARY KEY NOT NULL,
	"cpf" text NOT NULL,
	"status" integer DEFAULT 0 NOT NULL,
	"resposta" jsonb,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "consultas_cpf_cpf_idx" ON "consultas_cpf" USING btree ("cpf");--> statement-breakpoint
CREATE INDEX "consultas_cpf_data_idx" ON "consultas_cpf" USING btree ("criado_em");