# Panel web compilado, servido por Caddy (que además da el HTTPS y reenvía /api a la API).
# Contexto de construcción: frontend/. El Caddyfile se monta desde deploy/.
FROM node:24-bookworm-slim AS compilado
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM caddy:2.10-alpine
COPY --from=compilado /app/dist /srv/panel
