# Imagem com Chrome do sistema (Debian) + TODAS as bibliotecas que ele precisa (instaladas pelo apt,
# que resolve as dependências do pacote chromium — incl. libnss3, libgbm, etc.). É isso que faz o
# Chrome rodar de verdade aqui, ao contrário do serverless da Vercel. fonts-noto-color-emoji deixa os
# emojis (🏆 📦 etc.) idênticos à impressão.
FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    fonts-noto-color-emoji \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Caminho do Chrome do Debian (o server.js usa esta variável).
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .

EXPOSE 3000
CMD ["node", "server.js"]
