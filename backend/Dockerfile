# API de MACHOBOL (Node 24). Contexto de construcción: backend/.
# Debian slim (no Alpine): bcrypt es un módulo nativo y sus binarios precompilados son para glibc.
FROM node:24-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
COPY scripts ./scripts
# CA de Supabase: DATABASE_URL la usa con sslrootcert=certs/supabase-ca.crt (relativo a /app).
COPY certs ./certs
RUN mkdir -p tmp && chown node:node tmp

USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "src/server.js"]
