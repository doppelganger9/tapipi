# Tapipi is one Node process with no database: build, run, expose one port.
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY shared ./shared
COPY server ./server
COPY public ./public
COPY games ./games
ENV PORT=3000
EXPOSE 3000
USER node
CMD ["node", "server/index.js"]
