# Prumo WhatsApp bot: Baileys talks to WhatsApp over a WebSocket, no browser. The session lives in /data.

FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    WHATSAPP_AUTH_PATH=/data/baileys \
    TZ=America/Sao_Paulo
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates tzdata \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY index.js ./
COPY lib ./lib
RUN mkdir -p /data && chown -R node:node /app /data
USER node
VOLUME ["/data"]
CMD ["node", "index.js"]
