# ---------- dependências ----------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------- build ----------
FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Versão do deploy (commit): o navegador com uma versão antiga recarrega a página em vez de falhar.
ARG DEPLOY_ID=""
ENV DEPLOY_ID=$DEPLOY_ID
# Chave fixa das Server Actions (vem do .env da VM): sem ela cada build gera IDs novos e páginas
# abertas antes do deploy quebram ao salvar. Vai como secret do BuildKit, fora do histórico da imagem.
RUN --mount=type=secret,id=actions_key,required=false \
    if [ -s /run/secrets/actions_key ]; then export NEXT_SERVER_ACTIONS_ENCRYPTION_KEY="$(cat /run/secrets/actions_key)"; fi; \
    npm run build && npm prune --omit=dev

# ---------- execução ----------
FROM node:22-alpine
# Identifica as imagens deste app (limpeza no deploy sem tocar nas do outro sistema).
LABEL app=arvirtual-app
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 UPLOAD_DIR=/app/uploads
# xmllint: validação da NF-e no XSD oficial (esquemas em node_modules/@brasil-fiscal/nfe/schemas)
RUN apk add --no-cache libxml2-utils
# Afiliados: yt-dlp baixa os vídeos pelo link; ffmpeg junta vídeo+áudio, lê a duração e vai servir para a edição.
RUN apk add --no-cache ffmpeg yt-dlp
RUN addgroup -S app && adduser -S app -G app && mkdir -p /app/uploads && chown app:app /app/uploads
COPY --from=build --chown=app:app /app/package.json /app/next.config.mjs ./
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/.next ./.next
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/drizzle ./drizzle
COPY --from=build --chown=app:app /app/scripts ./scripts
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
# Aplica migrações (e cria o admin no primeiro acesso) antes de subir o servidor.
CMD ["sh", "-c", "node scripts/migrate.mjs && exec node_modules/.bin/next start -p $PORT"]
