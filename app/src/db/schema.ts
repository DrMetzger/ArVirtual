import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import type { EntregaPedido, ItemPedido } from "@/lib/marketplaces/types";

export type ComponenteFilamento = { filamentoId: number | null; gramas: number; tempoMin?: number };

const money = (name: string) => numeric(name, { precision: 14, scale: 2, mode: "number" });
const rate = (name: string) => numeric(name, { precision: 7, scale: 4, mode: "number" });
const timestamps = {
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

// ---------- Acesso ----------
export const usuarios = pgTable("usuarios", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull(),
  email: text("email").notNull().unique(),
  senhaHash: text("senha_hash").notNull(),
  papel: text("papel", { enum: ["admin", "usuario"] }).notNull().default("usuario"),
  /** Verificação em duas etapas por e-mail ligada pelo próprio usuário. */
  doisFatores: boolean("dois_fatores").notNull().default(false),
  ...timestamps,
});

/** Códigos de verificação enviados por e-mail (login em duas etapas e ativação). Guarda só o hash. */
export const codigosVerificacao = pgTable(
  "codigos_verificacao",
  {
    id: serial("id").primaryKey(),
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    finalidade: text("finalidade", { enum: ["login", "ativar"] }).notNull(),
    codigoHash: text("codigo_hash").notNull(),
    expiraEm: timestamp("expira_em", { withTimezone: true }).notNull(),
    tentativas: integer("tentativas").notNull().default(0),
    usadoEm: timestamp("usado_em", { withTimezone: true }),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("codigos_verificacao_usuario_idx").on(t.usuarioId)],
);

// ---------- Configurações ----------
/** Dados do emitente (linha única, id = 1). */
export const empresa = pgTable("empresa", {
  id: integer("id").primaryKey().default(1),
  razaoSocial: text("razao_social").notNull().default(""),
  nomeFantasia: text("nome_fantasia").notNull().default(""),
  cnpj: text("cnpj").notNull().default(""),
  inscricaoEstadual: text("inscricao_estadual").notNull().default(""),
  inscricaoMunicipal: text("inscricao_municipal").notNull().default(""),
  /** CRT da NF-e: 1 Simples Nacional, 2 Simples (excesso de sublimite), 3 Regime Normal, 4 MEI. */
  regime: integer("regime").notNull().default(1),
  cep: text("cep").notNull().default(""),
  logradouro: text("logradouro").notNull().default(""),
  numero: text("numero").notNull().default(""),
  complemento: text("complemento").notNull().default(""),
  bairro: text("bairro").notNull().default(""),
  cidade: text("cidade").notNull().default(""),
  uf: text("uf").notNull().default("SP"),
  codigoIbge: text("codigo_ibge").notNull().default(""),
  telefone: text("telefone").notNull().default(""),
  email: text("email").notNull().default(""),
  // Emissão da NF-e direto na SEFAZ
  ambienteNfe: text("ambiente_nfe", { enum: ["homologacao", "producao"] }).notNull().default("homologacao"),
  serieNfe: integer("serie_nfe").notNull().default(1),
  proximoNumeroNfe: integer("proximo_numero_nfe").notNull().default(1),
  /** Logo impresso no DANFE (arquivo PNG/JPG na pasta de uploads). */
  logoArquivo: text("logo_arquivo").notNull().default(""),
  /** % de crédito de ICMS do Simples (CSOSN 101/201), se houver. */
  aliquotaCreditoSn: numeric("aliquota_credito_sn", { precision: 5, scale: 2, mode: "number" }),
  ...timestamps,
});

/** Chave/valor para integrações e preferências. Valores secretos ficam criptografados. */
export const configuracoes = pgTable("configuracoes", {
  chave: text("chave").primaryKey(),
  valor: text("valor").notNull(),
  secreto: boolean("secreto").notNull().default(false),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
});

export const contasEmail = pgTable("contas_email", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull(),
  host: text("host").notNull(),
  porta: integer("porta").notNull().default(587),
  seguro: boolean("seguro").notNull().default(false),
  usuario: text("usuario").notNull(),
  senhaEnc: text("senha_enc").notNull(),
  remetenteNome: text("remetente_nome").notNull(),
  remetenteEmail: text("remetente_email").notNull(),
  padrao: boolean("padrao").notNull().default(false),
  ...timestamps,
});

/** Certificado digital A1 do emitente (linha única, id = 1). Arquivo e senha criptografados. */
export const certificadoDigital = pgTable("certificado_digital", {
  id: integer("id").primaryKey().default(1),
  arquivoEnc: text("arquivo_enc").notNull(),
  senhaEnc: text("senha_enc").notNull(),
  nomeArquivo: text("nome_arquivo").notNull().default(""),
  titular: text("titular").notNull().default(""),
  cnpj: text("cnpj").notNull().default(""),
  validoDe: timestamp("valido_de", { withTimezone: true }).notNull(),
  validoAte: timestamp("valido_ate", { withTimezone: true }).notNull(),
  ...timestamps,
});

// ---------- Clientes ----------
export const clientes = pgTable(
  "clientes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tipo: text("tipo", { enum: ["PF", "PJ"] }).notNull(),
    documento: text("documento").notNull(),
    nome: text("nome").notNull(),
    nomeFantasia: text("nome_fantasia").notNull().default(""),
    inscricaoEstadual: text("inscricao_estadual").notNull().default(""),
    /** indIEDest da NF-e: 1 contribuinte, 2 isento, 9 não contribuinte. */
    indicadorIe: integer("indicador_ie").notNull().default(9),
    email: text("email").notNull().default(""),
    telefone: text("telefone").notNull().default(""),
    situacaoCadastral: text("situacao_cadastral").notNull().default(""),
    dadosReceita: jsonb("dados_receita"),
    observacoes: text("observacoes").notNull().default(""),
    ...timestamps,
  },
  (t) => [uniqueIndex("clientes_documento_idx").on(t.documento), index("clientes_nome_idx").on(t.nome)],
);

export const enderecos = pgTable(
  "enderecos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clienteId: uuid("cliente_id")
      .notNull()
      .references(() => clientes.id, { onDelete: "cascade" }),
    apelido: text("apelido").notNull().default("Principal"),
    cep: text("cep").notNull(),
    logradouro: text("logradouro").notNull(),
    numero: text("numero").notNull(),
    complemento: text("complemento").notNull().default(""),
    bairro: text("bairro").notNull(),
    cidade: text("cidade").notNull(),
    uf: text("uf").notNull(),
    codigoIbge: text("codigo_ibge").notNull().default(""),
    principal: boolean("principal").notNull().default(false),
    ...timestamps,
  },
  (t) => [index("enderecos_cliente_idx").on(t.clienteId)],
);

// ---------- Produtos ----------
export const produtos = pgTable(
  "produtos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sku: text("sku").notNull(),
    nome: text("nome").notNull(),
    descricao: text("descricao").notNull().default(""),
    gtin: text("gtin").notNull().default(""),
    ncm: text("ncm").notNull(),
    cest: text("cest").notNull().default(""),
    /** Origem da mercadoria (0 a 8) conforme tabela da NF-e. */
    origem: integer("origem").notNull().default(0),
    unidade: text("unidade").notNull().default("UN"),
    preco: money("preco").notNull().default(0),
    custo: money("custo").notNull().default(0),
    estoque: integer("estoque").notNull().default(0),
    /** Abaixo disso o produto aparece como "repor" no estoque. */
    estoqueMinimo: integer("estoque_minimo").notNull().default(0),
    pesoG: integer("peso_g").notNull().default(0),
    alturaCm: numeric("altura_cm", { precision: 8, scale: 1, mode: "number" }).notNull().default(0),
    larguraCm: numeric("largura_cm", { precision: 8, scale: 1, mode: "number" }).notNull().default(0),
    comprimentoCm: numeric("comprimento_cm", { precision: 8, scale: 1, mode: "number" }).notNull().default(0),
    // Impressão 3D
    material: text("material").notNull().default(""),
    cor: text("cor").notNull().default(""),
    filamentoG: integer("filamento_g").notNull().default(0),
    tempoImpressaoMin: integer("tempo_impressao_min").notNull().default(0),
    /** Filamento principal (o primeiro da composição); filamentoG é o total de gramas por peça. */
    filamentoId: integer("filamento_id"),
    /** Filamentos usados na peça (multicor/AMS): cada um com as gramas por peça. Custo, produção e capacidade usam todos. */
    composicao: jsonb("composicao").$type<ComponenteFilamento[]>().notNull().default([]),
    imagens: text("imagens").array().notNull().default([]),
    /** Vídeos MP4 (URLs públicas na pasta de uploads); a Shopee recebe o primeiro. */
    videos: text("videos").array().notNull().default([]),
    /** Produto com variações (cores/filamentos): ele só agrupa; quem vende e tem estoque são as variações. */
    temVariacoes: boolean("tem_variacoes").notNull().default(false),
    /** Variação: aponta para o produto principal (herda fiscal, fotos e medidas). */
    paiId: uuid("pai_id").references((): AnyPgColumn => produtos.id, { onDelete: "cascade" }),
    /** Atributos da variação, ex.: { Cor: "Preto", Material: "PLA" }. */
    atributos: jsonb("atributos").$type<Record<string, string>>().notNull().default({}),
    /** Preço de venda por canal (vazio = usa o preço de venda). */
    precosCanal: jsonb("precos_canal").$type<Partial<Record<"mercadolivre" | "shopee" | "magalu" | "loja", number>>>().notNull().default({}),
    ativo: boolean("ativo").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("produtos_sku_idx").on(t.sku), index("produtos_pai_idx").on(t.paiId)],
);

// ---------- Fiscal ----------
export const regrasFiscais = pgTable("regras_fiscais", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull(),
  /** Maior prioridade vence quando mais de uma regra combina. */
  prioridade: integer("prioridade").notNull().default(0),
  /** Prefixo de NCM (ex.: "3926"); vazio = qualquer NCM. */
  ncmPrefixo: text("ncm_prefixo").notNull().default(""),
  /** UF de destino; vazio = qualquer UF. */
  ufDestino: text("uf_destino").notNull().default(""),
  destinatario: text("destinatario", { enum: ["qualquer", "contribuinte", "nao_contribuinte"] })
    .notNull()
    .default("qualquer"),
  naturezaOperacao: text("natureza_operacao").notNull().default("Venda de mercadoria"),
  cfopInterno: text("cfop_interno").notNull(),
  cfopInterestadual: text("cfop_interestadual").notNull(),
  csosn: text("csosn").notNull().default(""),
  cstIcms: text("cst_icms").notNull().default(""),
  aliqIcms: rate("aliq_icms").notNull().default(0),
  cstPis: text("cst_pis").notNull().default("49"),
  aliqPis: rate("aliq_pis").notNull().default(0),
  cstCofins: text("cst_cofins").notNull().default("49"),
  aliqCofins: rate("aliq_cofins").notNull().default(0),
  cstIpi: text("cst_ipi").notNull().default(""),
  aliqIpi: rate("aliq_ipi").notNull().default(0),
  ativo: boolean("ativo").notNull().default(true),
  ...timestamps,
});

export const STATUS_NOTA = ["rascunho", "autorizada", "rejeitada", "denegada", "erro", "cancelada"] as const;

export const notas = pgTable("notas", {
  id: uuid("id").primaryKey().defaultRandom(),
  clienteId: uuid("cliente_id")
    .notNull()
    .references(() => clientes.id),
  enderecoId: uuid("endereco_id").references(() => enderecos.id, { onDelete: "set null" }),
  status: text("status", { enum: STATUS_NOTA }).notNull().default("rascunho"),
  ambiente: text("ambiente", { enum: ["homologacao", "producao"] }).notNull().default("homologacao"),
  naturezaOperacao: text("natureza_operacao").notNull(),
  /** tPag da NF-e: 99 outros (marketplace), 17 PIX, 03 crédito, 04 débito, 15 boleto, 01 dinheiro, 90 sem pagamento. */
  formaPagamento: text("forma_pagamento").notNull().default("99"),
  numero: integer("numero"),
  serie: integer("serie"),
  chave: text("chave"),
  protocolo: text("protocolo"),
  codigoSefaz: text("codigo_sefaz"),
  /** XML assinado (NFe) e, depois de autorizado, o nfeProc (NFe + protocolo). */
  xml: text("xml"),
  xmlProc: text("xml_proc"),
  emitidaEm: timestamp("emitida_em", { withTimezone: true }),
  autorizadaEm: timestamp("autorizada_em", { withTimezone: true }),
  totalProdutos: money("total_produtos").notNull().default(0),
  totalImpostos: money("total_impostos").notNull().default(0),
  totalNota: money("total_nota").notNull().default(0),
  itens: jsonb("itens").notNull(),
  mensagem: text("mensagem").notNull().default(""),
  ...timestamps,
});

/** Cada ida à SEFAZ (transmissão, consulta, cancelamento, CC-e, status), com request e response para auditoria. */
export const eventosNfe = pgTable(
  "eventos_nfe",
  {
    id: serial("id").primaryKey(),
    notaId: uuid("nota_id").references(() => notas.id, { onDelete: "cascade" }),
    tipo: text("tipo").notNull(),
    ambiente: text("ambiente").notNull(),
    servico: text("servico").notNull().default(""),
    url: text("url").notNull().default(""),
    requisicao: text("requisicao"),
    resposta: text("resposta"),
    codigo: text("codigo"),
    mensagem: text("mensagem").notNull().default(""),
    protocolo: text("protocolo"),
    sucesso: boolean("sucesso").notNull().default(false),
    sequencia: integer("sequencia"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("eventos_nfe_nota_idx").on(t.notaId)],
);

/** Cadastro de NCM: criado automaticamente ao salvar produto; a IA completa descrição e IPI. */
export const ncms = pgTable("ncms", {
  codigo: text("codigo").primaryKey(),
  descricao: text("descricao").notNull(),
  aliquotaIpi: numeric("aliquota_ipi", { precision: 6, scale: 2, mode: "number" }),
  /** % aproximado de tributos (Lei 12.741). */
  aliquotaAproximada: numeric("aliquota_aproximada", { precision: 6, scale: 2, mode: "number" }),
  pendente: boolean("pendente").notNull().default(true),
  fonte: text("fonte", { enum: ["auto", "ia", "manual"] }).notNull().default("auto"),
  ...timestamps,
});

/** ICMS interno e FCP de cada UF (valores de referência: conferir). */
export const ufIcms = pgTable("uf_icms", {
  uf: text("uf").primaryKey(),
  aliquotaInterna: numeric("aliquota_interna", { precision: 5, scale: 2, mode: "number" }).notNull(),
  aliquotaFcp: numeric("aliquota_fcp", { precision: 5, scale: 2, mode: "number" }).notNull().default(0),
});

// ---------- Marketplaces ----------
// Ordem fixa usada em gráficos e listas.
export const MARKETPLACES = ["mercadolivre", "magalu", "shopee"] as const;
export type Marketplace = (typeof MARKETPLACES)[number];
/** Canais de venda dos pedidos: os marketplaces e a loja própria (Sincrolab, pedido manual). */
export const CANAIS_VENDA = [...MARKETPLACES, "loja"] as const;
export type CanalVenda = (typeof CANAIS_VENDA)[number];

export const contasMarketplace = pgTable(
  "contas_marketplace",
  {
    id: serial("id").primaryKey(),
    marketplace: text("marketplace", { enum: MARKETPLACES }).notNull(),
    nome: text("nome").notNull(),
    idExterno: text("id_externo").notNull(),
    accessTokenEnc: text("access_token_enc").notNull(),
    refreshTokenEnc: text("refresh_token_enc").notNull().default(""),
    expiraEm: timestamp("expira_em", { withTimezone: true }),
    dados: jsonb("dados"),
    ultimaSincronizacao: timestamp("ultima_sincronizacao", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("contas_marketplace_ext_idx").on(t.marketplace, t.idExterno)],
);

export const anuncios = pgTable("anuncios", {
  id: serial("id").primaryKey(),
  produtoId: uuid("produto_id")
    .notNull()
    .references(() => produtos.id, { onDelete: "cascade" }),
  contaId: integer("conta_id")
    .notNull()
    .references(() => contasMarketplace.id, { onDelete: "cascade" }),
  marketplace: text("marketplace", { enum: MARKETPLACES }).notNull(),
  idExterno: text("id_externo"),
  link: text("link"),
  status: text("status", { enum: ["publicado", "erro", "pausado"] }).notNull(),
  preco: money("preco").notNull(),
  mensagem: text("mensagem").notNull().default(""),
  ...timestamps,
});

export const pedidosMarketplace = pgTable(
  "pedidos_marketplace",
  {
    id: serial("id").primaryKey(),
    /** Conta do marketplace; vazio nos pedidos da loja própria. */
    contaId: integer("conta_id").references(() => contasMarketplace.id, { onDelete: "cascade" }),
    marketplace: text("marketplace", { enum: CANAIS_VENDA }).notNull(),
    idExterno: text("id_externo").notNull(),
    status: text("status").notNull(),
    total: money("total").notNull().default(0),
    frete: money("frete").notNull().default(0),
    comprador: text("comprador").notNull().default(""),
    data: timestamp("data", { withTimezone: true }).notNull(),
    itens: jsonb("itens").$type<ItemPedido[]>().notNull().default([]),
    entrega: jsonb("entrega").$type<EntregaPedido | null>(),
    /** Nota fiscal gerada a partir do pedido. */
    notaId: uuid("nota_id").references(() => notas.id, { onDelete: "set null" }),
    /** Cliente do cadastro (pedido manual ou comprador já cadastrado). */
    clienteId: uuid("cliente_id").references(() => clientes.id, { onDelete: "set null" }),
    desconto: money("desconto").notNull().default(0),
    observacoes: text("observacoes").notNull().default(""),
    /** A venda já saiu do estoque (volta se o pedido for cancelado). */
    estoqueBaixado: boolean("estoque_baixado").notNull().default(false),
    /** O título a receber deste pedido já foi gerado. */
    financeiroGerado: boolean("financeiro_gerado").notNull().default(false),
    dados: jsonb("dados"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("pedidos_marketplace_ext_idx").on(t.marketplace, t.idExterno),
    index("pedidos_marketplace_data_idx").on(t.data),
  ],
);

/** NF-e emitida fora do sistema e informada ao marketplace (ex.: Magalu devolve chave e XML), ligada ao pedido. */
export const notasExternas = pgTable(
  "notas_externas",
  {
    id: serial("id").primaryKey(),
    pedidoId: integer("pedido_id")
      .notNull()
      .references(() => pedidosMarketplace.id, { onDelete: "cascade" }),
    origem: text("origem").notNull(),
    chave: text("chave").notNull(),
    numero: integer("numero").notNull().default(0),
    serie: integer("serie").notNull().default(0),
    cnpjEmitente: text("cnpj_emitente").notNull().default(""),
    emitidaEm: timestamp("emitida_em", { withTimezone: true }),
    valor: money("valor").notNull().default(0),
    /** Situação no marketplace: approved, validating, invalid. */
    status: text("status").notNull().default(""),
    xml: text("xml").notNull().default(""),
    ...timestamps,
  },
  (t) => [uniqueIndex("notas_externas_chave_idx").on(t.chave), index("notas_externas_pedido_idx").on(t.pedidoId)],
);

/** SKU/anúncio do marketplace ligado a um produto do cadastro (quando o SKU do anúncio é diferente). */
export const vinculosSku = pgTable(
  "vinculos_sku",
  {
    id: serial("id").primaryKey(),
    canal: text("canal", { enum: CANAIS_VENDA }).notNull(),
    /** SKU do anúncio ou id do anúncio no marketplace. */
    chave: text("chave").notNull(),
    produtoId: uuid("produto_id")
      .notNull()
      .references(() => produtos.id, { onDelete: "cascade" }),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("vinculos_sku_canal_chave_idx").on(t.canal, t.chave)],
);

// ---------- Estoque ----------
export const TIPOS_MOVIMENTO = ["entrada", "saida", "ajuste", "producao", "venda", "estorno"] as const;
/** Kardex dos produtos: cada linha muda o saldo (quantidade positiva entra, negativa sai). */
export const movimentosEstoque = pgTable(
  "movimentos_estoque",
  {
    id: serial("id").primaryKey(),
    produtoId: uuid("produto_id")
      .notNull()
      .references(() => produtos.id, { onDelete: "cascade" }),
    tipo: text("tipo", { enum: TIPOS_MOVIMENTO }).notNull(),
    quantidade: integer("quantidade").notNull(),
    saldo: integer("saldo").notNull(),
    /** De onde veio: "pedido:12", "nota-entrada:3", "producao:5"... */
    origem: text("origem").notNull().default(""),
    observacao: text("observacao").notNull().default(""),
    usuarioId: uuid("usuario_id").references(() => usuarios.id, { onDelete: "set null" }),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("movimentos_estoque_produto_idx").on(t.produtoId, t.criadoEm)],
);

// ---------- Compras ----------
export const fornecedores = pgTable(
  "fornecedores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tipo: text("tipo", { enum: ["PF", "PJ"] }).notNull(),
    documento: text("documento").notNull(),
    nome: text("nome").notNull(),
    nomeFantasia: text("nome_fantasia").notNull().default(""),
    inscricaoEstadual: text("inscricao_estadual").notNull().default(""),
    email: text("email").notNull().default(""),
    telefone: text("telefone").notNull().default(""),
    cidade: text("cidade").notNull().default(""),
    uf: text("uf").notNull().default(""),
    observacoes: text("observacoes").notNull().default(""),
    ...timestamps,
  },
  (t) => [uniqueIndex("fornecedores_documento_idx").on(t.documento)],
);

// ---------- Filamentos (matéria-prima) ----------
export const filamentos = pgTable(
  "filamentos",
  {
    id: serial("id").primaryKey(),
    material: text("material").notNull(),
    cor: text("cor").notNull(),
    /** Cor para a amostra na tela (#rrggbb). */
    corHex: text("cor_hex").notNull().default("#888888"),
    marca: text("marca").notNull().default(""),
    /** Custo médio ponderado por kg (recalculado a cada entrada). */
    custoKg: money("custo_kg").notNull().default(0),
    saldoG: integer("saldo_g").notNull().default(0),
    minimoG: integer("minimo_g").notNull().default(0),
    ativo: boolean("ativo").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("filamentos_material_cor_marca_idx").on(t.material, t.cor, t.marca)],
);

export const TIPOS_MOV_FILAMENTO = ["entrada", "consumo", "ajuste", "estorno"] as const;
export const movimentosFilamento = pgTable(
  "movimentos_filamento",
  {
    id: serial("id").primaryKey(),
    filamentoId: integer("filamento_id")
      .notNull()
      .references(() => filamentos.id, { onDelete: "cascade" }),
    tipo: text("tipo", { enum: TIPOS_MOV_FILAMENTO }).notNull(),
    gramas: integer("gramas").notNull(),
    saldoG: integer("saldo_g").notNull(),
    /** Custo/kg desta entrada (nas entradas). */
    custoKg: money("custo_kg").notNull().default(0),
    origem: text("origem").notNull().default(""),
    observacao: text("observacao").notNull().default(""),
    usuarioId: uuid("usuario_id").references(() => usuarios.id, { onDelete: "set null" }),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("movimentos_filamento_idx").on(t.filamentoId, t.criadoEm)],
);

/** Ordem de produção concluída: entra peça no estoque e sai filamento. */
export const producoes = pgTable("producoes", {
  id: serial("id").primaryKey(),
  produtoId: uuid("produto_id")
    .notNull()
    .references(() => produtos.id, { onDelete: "cascade" }),
  filamentoId: integer("filamento_id").references(() => filamentos.id, { onDelete: "set null" }),
  quantidade: integer("quantidade").notNull(),
  gramas: integer("gramas").notNull(),
  /** Filamento perdido (impressão que falhou, purga...). */
  perdaG: integer("perda_g").notNull().default(0),
  tempoMin: integer("tempo_min").notNull().default(0),
  observacao: text("observacao").notNull().default(""),
  usuarioId: uuid("usuario_id").references(() => usuarios.id, { onDelete: "set null" }),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

export const notasEntrada = pgTable(
  "notas_entrada",
  {
    id: serial("id").primaryKey(),
    fornecedorId: uuid("fornecedor_id").references(() => fornecedores.id, { onDelete: "restrict" }),
    numero: text("numero").notNull().default(""),
    serie: text("serie").notNull().default(""),
    chave: text("chave"),
    emissao: timestamp("emissao", { withTimezone: true }),
    entrada: timestamp("entrada", { withTimezone: true }).notNull().defaultNow(),
    valorProdutos: money("valor_produtos").notNull().default(0),
    frete: money("frete").notNull().default(0),
    outras: money("outras").notNull().default(0),
    desconto: money("desconto").notNull().default(0),
    valorTotal: money("valor_total").notNull().default(0),
    /** Parcelas a pagar (da NF-e ou digitadas): [{ vencimento: "AAAA-MM-DD", valor }]. */
    parcelas: jsonb("parcelas").$type<{ vencimento: string; valor: number }[]>().notNull().default([]),
    status: text("status", { enum: ["rascunho", "lancada", "cancelada"] }).notNull().default("rascunho"),
    xml: text("xml"),
    observacoes: text("observacoes").notNull().default(""),
    lancadaEm: timestamp("lancada_em", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("notas_entrada_chave_idx").on(t.chave)],
);

export const itensNotaEntrada = pgTable("itens_nota_entrada", {
  id: serial("id").primaryKey(),
  notaId: integer("nota_id")
    .notNull()
    .references(() => notasEntrada.id, { onDelete: "cascade" }),
  codigo: text("codigo").notNull().default(""),
  descricao: text("descricao").notNull(),
  ncm: text("ncm").notNull().default(""),
  cfop: text("cfop").notNull().default(""),
  unidade: text("unidade").notNull().default("UN"),
  quantidade: numeric("quantidade", { precision: 14, scale: 4, mode: "number" }).notNull(),
  valorUnitario: numeric("valor_unitario", { precision: 14, scale: 4, mode: "number" }).notNull(),
  valorTotal: money("valor_total").notNull(),
  /** O que o item vira ao lançar: filamento (gramas), produto (peças no estoque) ou despesa (só financeiro). */
  destino: text("destino", { enum: ["filamento", "produto", "despesa"] }).notNull().default("despesa"),
  filamentoId: integer("filamento_id").references(() => filamentos.id, { onDelete: "set null" }),
  produtoId: uuid("produto_id").references(() => produtos.id, { onDelete: "set null" }),
  /** Filamento: gramas por unidade comprada (1 rolo = 1000 g). */
  gramasPorUnidade: integer("gramas_por_unidade").notNull().default(1000),
});

// ---------- Financeiro ----------
/** Onde o dinheiro está: caixa, conta bancária, saldo no Mercado Pago... */
export const contasCaixa = pgTable("contas_caixa", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull(),
  saldoInicial: money("saldo_inicial").notNull().default(0),
  ativo: boolean("ativo").notNull().default(true),
  ...timestamps,
});

/** Títulos a receber e a pagar (gerados por pedidos e notas de entrada, ou lançados na mão). */
export const lancamentos = pgTable(
  "lancamentos",
  {
    id: serial("id").primaryKey(),
    tipo: text("tipo", { enum: ["receber", "pagar"] }).notNull(),
    descricao: text("descricao").notNull(),
    categoria: text("categoria").notNull().default(""),
    valor: money("valor").notNull(),
    vencimento: timestamp("vencimento", { withTimezone: true }).notNull(),
    status: text("status", { enum: ["aberto", "pago", "cancelado"] }).notNull().default("aberto"),
    pagoEm: timestamp("pago_em", { withTimezone: true }),
    valorPago: money("valor_pago"),
    contaCaixaId: integer("conta_caixa_id").references(() => contasCaixa.id, { onDelete: "set null" }),
    formaPagamento: text("forma_pagamento").notNull().default(""),
    /** Parcela "1/3" quando vem de uma nota com várias duplicatas. */
    parcela: text("parcela").notNull().default(""),
    /** De onde veio: "pedido:12", "nota-entrada:3" ou vazio (manual). */
    origem: text("origem").notNull().default(""),
    clienteId: uuid("cliente_id").references(() => clientes.id, { onDelete: "set null" }),
    fornecedorId: uuid("fornecedor_id").references(() => fornecedores.id, { onDelete: "set null" }),
    observacoes: text("observacoes").notNull().default(""),
    ...timestamps,
  },
  (t) => [index("lancamentos_tipo_venc_idx").on(t.tipo, t.status, t.vencimento), index("lancamentos_origem_idx").on(t.origem)],
);

// Consultas de CPF na APICPF: controla os limites do plano (por dia e por minuto) e serve de cache.
export const consultasCpf = pgTable(
  "consultas_cpf",
  {
    id: serial("id").primaryKey(),
    cpf: text("cpf").notNull(),
    /** Status HTTP devolvido pela APICPF (0 = reservada, ainda sem resposta). */
    status: integer("status").notNull().default(0),
    resposta: jsonb("resposta"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("consultas_cpf_cpf_idx").on(t.cpf), index("consultas_cpf_data_idx").on(t.criadoEm)],
);

// ---------- Assistente de IA ----------
/** Arquivo enviado na conversa (fica em UPLOAD_DIR/ia, acesso só com login) ou imagem gerada pela IA. */
export type AnexoIa = {
  nome: string;
  tipo: string;
  arquivo: string;
  tamanho: number;
  /** Conteúdo em texto para a IA (planilhas, XML, resumo do STL/G-code); imagens e PDF vão como arquivo. */
  texto?: string;
};
export type FonteIa = { titulo: string; url: string };

export const conversasIa = pgTable(
  "conversas_ia",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    titulo: text("titulo").notNull().default("Nova conversa"),
    pasta: text("pasta").notNull().default(""),
    fixada: boolean("fixada").notNull().default(false),
    ...timestamps,
  },
  (t) => [index("conversas_ia_usuario_idx").on(t.usuarioId, t.atualizadoEm)],
);

export const mensagensIa = pgTable(
  "mensagens_ia",
  {
    id: serial("id").primaryKey(),
    conversaId: uuid("conversa_id")
      .notNull()
      .references(() => conversasIa.id, { onDelete: "cascade" }),
    papel: text("papel", { enum: ["user", "model"] }).notNull(),
    texto: text("texto").notNull().default(""),
    anexos: jsonb("anexos").$type<AnexoIa[]>().notNull().default([]),
    fontes: jsonb("fontes").$type<FonteIa[]>().notNull().default([]),
    modelo: text("modelo").notNull().default(""),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("mensagens_ia_conversa_idx").on(t.conversaId, t.id)],
);

/** O que a IA aprendeu sobre a empresa (vale para todas as conversas). */
export const memoriasIa = pgTable("memorias_ia", {
  id: serial("id").primaryKey(),
  texto: text("texto").notNull(),
  conversaId: uuid("conversa_id").references(() => conversasIa.id, { onDelete: "set null" }),
  ativo: boolean("ativo").notNull().default(true),
  ...timestamps,
});

// ---------- Relações ----------
export const clientesRelations = relations(clientes, ({ many }) => ({ enderecos: many(enderecos) }));
export const enderecosRelations = relations(enderecos, ({ one }) => ({
  cliente: one(clientes, { fields: [enderecos.clienteId], references: [clientes.id] }),
}));
export const anunciosRelations = relations(anuncios, ({ one }) => ({
  produto: one(produtos, { fields: [anuncios.produtoId], references: [produtos.id] }),
  conta: one(contasMarketplace, { fields: [anuncios.contaId], references: [contasMarketplace.id] }),
}));
export const notasEntradaRelations = relations(notasEntrada, ({ one, many }) => ({
  fornecedor: one(fornecedores, { fields: [notasEntrada.fornecedorId], references: [fornecedores.id] }),
  itens: many(itensNotaEntrada),
}));
export const itensNotaEntradaRelations = relations(itensNotaEntrada, ({ one }) => ({
  nota: one(notasEntrada, { fields: [itensNotaEntrada.notaId], references: [notasEntrada.id] }),
}));
export const notasRelations = relations(notas, ({ one, many }) => ({
  cliente: one(clientes, { fields: [notas.clienteId], references: [clientes.id] }),
  endereco: one(enderecos, { fields: [notas.enderecoId], references: [enderecos.id] }),
  eventos: many(eventosNfe),
}));
export const eventosNfeRelations = relations(eventosNfe, ({ one }) => ({
  nota: one(notas, { fields: [eventosNfe.notaId], references: [notas.id] }),
}));

export type Cliente = typeof clientes.$inferSelect;
export type Endereco = typeof enderecos.$inferSelect;
export type Produto = typeof produtos.$inferSelect;
export type RegraFiscal = typeof regrasFiscais.$inferSelect;
export type Empresa = typeof empresa.$inferSelect;
export type ContaMarketplace = typeof contasMarketplace.$inferSelect;
export type Nota = typeof notas.$inferSelect;
export type PedidoMarketplace = typeof pedidosMarketplace.$inferSelect;
export type MovimentoEstoque = typeof movimentosEstoque.$inferSelect;
export type Filamento = typeof filamentos.$inferSelect;
export type Fornecedor = typeof fornecedores.$inferSelect;
export type NotaEntrada = typeof notasEntrada.$inferSelect;
export type ItemNotaEntrada = typeof itensNotaEntrada.$inferSelect;
export type Lancamento = typeof lancamentos.$inferSelect;
export type ContaCaixa = typeof contasCaixa.$inferSelect;
export type CertificadoDigital = typeof certificadoDigital.$inferSelect;
export type Ncm = typeof ncms.$inferSelect;
export type ConversaIa = typeof conversasIa.$inferSelect;
export type MensagemIa = typeof mensagensIa.$inferSelect;
export type MemoriaIa = typeof memoriasIa.$inferSelect;
export type NotaExterna = typeof notasExternas.$inferSelect;
