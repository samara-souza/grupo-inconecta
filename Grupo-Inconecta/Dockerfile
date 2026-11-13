# Servidor único (site estático + API); sem processo residente extra.
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY server.js ./server.js
COPY src ./src
COPY public ./public
USER node
EXPOSE 8080
CMD ["node", "server.js"]
