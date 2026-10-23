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
Docker Compose · Caddy (HTTPS automático).

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

O workflow `.github/workflows/app-deploy.yml` roda a cada push na `main` que mexa em `app/`:
verifica tipos e build, envia os arquivos para a VM por SSH e sobe `db`, `app` e `caddy` com Docker Compose.

### 1. Preparar a VM (uma vez)

Ubuntu/Debian com acesso root:

```bash
curl -fsSL https://raw.githubusercontent.com/DrMetzger/ArVirtual/main/app/deploy/preparar-vm.sh | sudo bash -s -- deploy
```

Instala Docker e rsync, cria o usuário `deploy`, a pasta `/opt/arvirtual-app` e libera as portas 22, 80 e 443.
Depois gere um par de chaves e autorize a pública na VM:

```bash
ssh-keygen -t ed25519 -f arvirtual_deploy -N ""      # no seu computador
ssh-copy-id -i arvirtual_deploy.pub deploy@IP_DA_VM   # ou cole em /home/deploy/.ssh/authorized_keys
```

### 2. DNS

Crie o registro do subdomínio `app` apontando para a VM:

| Situação | Tipo | Nome | Valor |
|---|---|---|---|
| A VM tem IP fixo (o mais comum) | **A** | `app` | IP público da VM |
| O provedor dá um nome de host (ex.: `xxx.cloudapp.azure.com`) | **CNAME** | `app` | esse nome de host |

Um CNAME não pode apontar para um IP: com IP fixo, use registro A. Se o DNS estiver no Cloudflare, deixe como
"DNS only" (nuvem cinza) até o primeiro certificado ser emitido.

### 3. Secrets e Variables no GitHub

**Settings › Secrets and variables › Actions**

Secrets:

| Nome | Valor |
|---|---|
| `VM_HOST` | IP ou nome da VM |
| `VM_USER` | `deploy` |
| `VM_SSH_KEY` | conteúdo da chave **privada** (`arvirtual_deploy`) |
| `VM_PORT` | porta SSH (opcional, padrão 22) |
| `POSTGRES_PASSWORD` | senha forte do banco |
| `AUTH_SECRET` | `openssl rand -base64 48` |
| `ENCRYPTION_KEY` | `openssl rand -base64 48` (**nunca troque depois de usar**) |
| `ADMIN_EMAIL` | e-mail do primeiro administrador |
| `ADMIN_PASSWORD` | senha inicial (10+ caracteres); troque depois em Configurações |

Variables (opcionais):

| Nome | Padrão |
|---|---|
| `APP_DOMAIN` | `app.arvirtual.com.br` |
| `ADMIN_NAME` | `Administrador` |
| `VM_APP_DIR` | `/opt/arvirtual-app` |

Os valores não podem conter aspas simples (`'`).

### 4. Publicar

Faça merge na `main` ou rode **Actions › Deploy do aplicativo (VM) › Run workflow**. O banco e as imagens enviadas
ficam em volumes Docker e sobrevivem aos deploys.

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
