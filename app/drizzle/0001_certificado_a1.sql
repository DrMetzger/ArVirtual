CREATE TABLE "certificado_digital" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"arquivo_enc" text NOT NULL,
	"senha_enc" text NOT NULL,
	"nome_arquivo" text DEFAULT '' NOT NULL,
	"titular" text DEFAULT '' NOT NULL,
	"cnpj" text DEFAULT '' NOT NULL,
	"valido_de" timestamp with time zone NOT NULL,
	"valido_ate" timestamp with time zone NOT NULL,
	"enviado_focus_em" timestamp with time zone,
	"mensagem_focus" text DEFAULT '' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
