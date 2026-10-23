# ArVirtual · Aplicativo de gestão

Sistema interno em **app.arvirtual.com.br**: produtos e clientes, matriz fiscal com emissão de NF-e, anúncios e pedidos de
**Mercado Livre, Shopee e Magalu**, e um assistente com **Google Gemini**. Tema claro (azul) e escuro (azul-marinho com
dourado e o vermelho do logo).

## Módulos

| Módulo | O que faz |
|---|---|
| **Dashboard** | Vendas dos últimos 30 dias por marketplace, ticket médio, NF-e do mês, estoque baixo e checklist de configuração. |
| **Clientes** | PF e PJ. CNPJ busca razão social, IE, situação e endereço na Receita (CNPJ.ws / BrasilAPI). CPF é validado; o nome vem do Serpro, se configurado. Vários endereços por cliente, com busca de CEP (base dos Correios via ViaCEP / BrasilAPI) e código IBGE. |
| **Produtos** | Catálogo com NCM, CEST, origem, GTIN, dimensões e imagens. Para impressão 3D (Bambu Lab A1 mini): filamento e tempo calculam custo e preço sugerido. |
| **Matriz fiscal** | Regras por NCM, UF de destino e tipo de cliente definindo CFOP (interno/interestadual), CSOSN/CST e alíquotas de ICMS, PIS, COFINS e IPI. Já traz regras sugeridas para o Simples Nacional. |
| **Notas fiscais** | Monta a nota, mostra os impostos de cada item e emite pela **Focus NFe** (homologação ou produção). DANFE, XML, cancelamento e envio por e-mail ao cliente. |
| **Marketplaces** | Conexão OAuth com cada loja, publicação de anúncios a partir do catálogo e importação de pedidos para o dashboard. |
| **Assistente IA** | Chat com o Gemini e geração de título/descrição de anúncio na página do produto. |
| **Configurações** | Dados da empresa (emitente), chaves de API, contas de e-mail SMTP e usuários. Senhas e tokens ficam criptografados (AES-256-GCM). |

## Tecnologias

Next.js 16 (App Router, Server Actions) · React 19 · TypeScript · Tailwind CSS 4 · PostgreSQL 16 + Drizzle ORM ·
Docker Compose.

## Rodar localmente

```bash
cd app
cp .env.example .env.local      # ajuste DATABASE_URL, AUTH_SECRET, ENCRYPTION_KEY, ADMIN_*
npm install
npm run db:migrate              # cria as tabelas e o usuário administrador
npm run dev                     # http://localhost:3000
```

Depois de mudar `src/db/schema.ts`, gere a migração com `npm run db:generate` e faça commit da pasta `drizzle/`.

## Deploy na VM

O workflow `.github/workflows/app-deploy.yml` roda a cada push na `main` que mexa em `app/`. Ele verifica tipos e build,
entra na VM por SSH com usuário e senha, instala o Docker se faltar, envia os arquivos e sobe `db` e `app`.

### Secrets (Settings › Secrets and variables › Actions)

| Nome | Obrigatório | Valor |
|---|---|---|
| `VM_HOST` | sim | IP da VM |
| `VM_USER` | não (padrão `root`) | usuário SSH |
| `VM_PSW` | sim | senha SSH desse usuário |
| `VM_PORT` | não (padrão 22) | porta SSH |
| `ADMIN_EMAIL` | não (padrão `kleber@arvirtual.com.br`) | login do primeiro administrador |
| `ADMIN_PASSWORD` | não | senha do primeiro administrador; sem ele, vale a mesma senha do `VM_PSW` (troque em Configurações › Usuários) |
| `POSTGRES_PASSWORD`, `AUTH_SECRET`, `ENCRYPTION_KEY` | não | gerados automaticamente no primeiro deploy e guardados em `/opt/arvirtual-app/.env` na VM |

O `.env` da VM é reaproveitado a cada deploy, então as chaves geradas nunca mudam sozinhas.
**Não apague esse arquivo**: sem o `ENCRYPTION_KEY` original, as chaves de API salvas no sistema ficam ilegíveis.

### Acesso

A VM é compartilhada com outro sistema, que usa as portas 80/443. Este app fica na porta **8080**
(variable `APP_PORT` para trocar) e é acessado direto: `http://IP-DA-VM:8080`. O deploy só mexe no projeto
Docker `arvirtual-app` e na pasta `/opt/arvirtual-app`.

## Integrações (cadastradas em Configurações › Integrações)

| Integração | Onde obter | Observação |
|---|---|---|
| Google Gemini | aistudio.google.com › Get API key | Modelo padrão `gemini-2.5-flash`, configurável. |
| Focus NFe | app.focusnfe.com.br | Precisa do certificado A1 da empresa cadastrado na Focus. Comece em homologação. |
| Serpro Consulta CPF | loja.serpro.gov.br | Opcional e pago. Sem ele, o CPF só é validado. |
| Mercado Livre | developers.mercadolivre.com.br › Criar aplicação | Redirect URI: `https://app.arvirtual.com.br/api/marketplaces/mercadolivre/callback` |
| Shopee | open.shopee.com › App (Seller in-house) | Redirect: `https://app.arvirtual.com.br/api/marketplaces/shopee/callback` |
| Magalu | developers.magalu.com | Redirect: `https://app.arvirtual.com.br/api/marketplaces/magalu/callback` |

As URLs de retorno também aparecem na tela **Marketplaces**.

## Limitações conhecidas

- **Anúncios**: categorias com atributos obrigatórios (marca, modelo, voltagem etc.) podem ser recusadas pelo
  marketplace. A mensagem de erro aparece no histórico do produto; informe o ID da categoria e complete os atributos.
- **Magalu**: a integração segue a documentação pública da API de sellers. Escopos e campos dependem do que o Magalu
  liberar para o app; valide a primeira publicação e os pedidos com a conta real.
- **Fiscal**: as regras sugeridas são um ponto de partida para o Simples Nacional. Confirme NCM, CFOP e CSOSN com o contador
  antes de emitir em produção. DIFAL e ICMS-ST não são calculados automaticamente.
