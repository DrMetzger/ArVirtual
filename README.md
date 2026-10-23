# ArVirtual: Pesquisa & Desenvolvimento

Este repositório tem duas partes independentes:

| Pasta | O que é | Publicação |
|---|---|---|
| raiz (`index.html`, `assets/`) | Site institucional www.arvirtual.com.br | FTP (`deploy.yml`) |
| [`app/`](app/README.md) | Aplicativo de gestão app.arvirtual.com.br | VM com Docker (`app-deploy.yml`) |

## Site institucional

Automação com ESP32/IoT, otimização de processos e integrações de marketplaces com TOTVS Protheus (ADVPL/TLPP).

Site estático (HTML + CSS + JS, sem build), com tema claro e tema escuro em azul e dourado (botão no topo).

## Estrutura

```
index.html                  página principal
assets/css/style.css        estilos e temas (claro / escuro azul+dourado)
assets/js/main.js           tema, menu mobile, formulário, WhatsApp
assets/js/config.js         dados de contato (gerado no deploy)
assets/img/                 logo e ícones
.github/workflows/deploy.yml  publicação via FTP
.env.example                lista das variáveis
```

## Rodar localmente

Abra o `index.html` no navegador, ou rode `python3 -m http.server 8000` e acesse http://localhost:8000.

## Publicação via FTP

O workflow `.github/workflows/deploy.yml` envia o site por FTP para a hospedagem a cada push na `main`. Também dá para rodar manualmente na aba **Actions › Deploy do site (FTP) › Run workflow**. Só os arquivos alterados são enviados.

### Secrets (dados do FTP)

Em **Settings › Secrets and variables › Actions › aba Secrets**:

| Nome | Exemplo | Obrigatória |
|---|---|---|
| `FTP_SERVER` | `ftp.arvirtual.com.br` | sim |
| `FTP_USERNAME` | usuário do FTP | sim |
| `FTP_PASSWORD` | senha do FTP | sim |
| `FTP_SERVER_DIR` | `./public_html/` (padrão), termine com `/` | não |
| `FTP_PORT` | `21` (padrão) | não |
| `FTP_PROTOCOL` | `ftp` (padrão), `ftps` ou `ftps-legacy` | não |

### Variables (dados exibidos no site)

Em **Settings › Secrets and variables › Actions › aba Variables**, todas opcionais:

| Nome | Exemplo |
|---|---|
| `SITE_URL` | `https://www.arvirtual.com.br` |
| `CONTACT_EMAIL` | `kleber@arvirtual.com.br` |
| `CONTACT_PHONE` | `(17) 98136-8201` |
| `WHATSAPP_NUMBER` | `5517981368201` (só dígitos, com 55 + DDD) |
| `ADDRESS` | `Rua Santos Dumont, 79 - Bairro Vila Ercília, São José do Rio Preto - SP` |
| `FORMSPREE_ID` | ID do formulário em formspree.io |
| `GA_MEASUREMENT_ID` | `G-XXXXXXXXXX` (Google Analytics) |

Variável vazia usa o valor padrão de `assets/js/config.js`. Sem `FORMSPREE_ID`, o formulário abre o e-mail do visitante já preenchido.
