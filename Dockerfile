# ==============================================================
# CESTAON — MULTI-STAGE DOCKERFILE OTIMIZADO PARA PRODUÇÃO
# ==============================================================

# Etapa 1: Compilação do Frontend SPA (React 19 + Vite + Tailwind)
FROM node:22-alpine AS client-builder
WORKDIR /app/client

# Instalação limpa de dependências do frontend
COPY client/package*.json ./
RUN npm ci

# Compilação do bundle estático para /app/client/dist
COPY client/ ./
RUN npm run build

# Etapa 2: Imagem Final de Execução em Node.js 22 LTS (com SQLite nativo embutido)
FROM node:22-alpine AS production
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/app/data/feira.db
ENV TRUST_PROXY=true

# Instala apenas dependências de produção do backend
COPY package*.json ./
RUN npm ci --omit=dev

# Copia código do backend e DDL do SQLite
COPY server/ ./server/

# Copia o build estático otimizado do frontend
COPY --from=client-builder /app/client/dist ./client/dist

# Cria diretório de dados para o volume de persistência e ajusta permissões
RUN mkdir -p /app/data && chown -R node:node /app

# Execução segura com usuário não-privilegiado (node)
USER node

# Ponto de montagem para volume persistente do banco SQLite
VOLUME ["/app/data"]

EXPOSE 3000

# Verificação contínua de saúde do contêiner
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Comando de inicialização do servidor CestaON
CMD ["node", "server/index.js"]
