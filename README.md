# ArVirtual: Pesquisa & Desenvolvimento

Site institucional da ArVirtual: automação com ESP32/IoT, otimização de processos e integrações de marketplaces com TOTVS Protheus (ADVPL/TLPP).

Site estático (HTML + CSS + JS, sem build), com tema claro e tema escuro em azul e dourado (botão no topo).

## Estrutura

```
index.html                  página principal
assets/css/style.css        estilos e temas (claro / escuro azul+dourado)
assets/js/main.js           tema, menu mobile, formulário, WhatsApp
assets/js/config.js         dados de contato (gerado no deploy)
assets/img/                 logo e ícones
.github/workflows/deploy.yml  publicação no GitHub Pages
.env.example                lista das variáveis
```

## Rodar localmente

Abra o `index.html` no navegador, ou rode `python3 -m http.server 8000` e acesse http://localhost:8000.

## Variáveis (GitHub)

Em **Settings › Secrets and variables › Actions › aba Variables**, crie:

| Nome | Exemplo | Obrigatória |
|---|---|---|
| `SITE_URL` | `https://www.arvirtual.com.br` | não |
| `CONTACT_EMAIL` | `kleber@arvirtual.com.br` | não |
| `CONTACT_PHONE` | `(17) 98136-8201` | não |
| `WHATSAPP_NUMBER` | `5517981368201` (só dígitos, com 55 + DDD) | não |
| `ADDRESS` | `Rua Santos Dumont, 79 - Bairro Vila Ercília, São José do Rio Preto - SP` | não |
| `CUSTOM_DOMAIN` | `www.arvirtual.com.br` | só com domínio próprio |
| `FORMSPREE_ID` | ID do formulário em formspree.io | opcional |
| `GA_MEASUREMENT_ID` | `G-XXXXXXXXXX` (Google Analytics) | opcional |

Variável vazia usa o valor padrão de `assets/js/config.js`. Nada aqui é segredo: todos os valores ficam visíveis no site.

Sem `FORMSPREE_ID`, o formulário abre o e-mail do visitante já preenchido.

## Publicar

1. **Settings › Pages › Source: GitHub Actions**.
2. Faça merge/push na `main`. O workflow publica sozinho.
3. Domínio próprio: defina `CUSTOM_DOMAIN` e, no DNS do domínio, crie um `CNAME` de `www` apontando para `drmetzger.github.io`.
