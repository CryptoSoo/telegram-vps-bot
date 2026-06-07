FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY bot.js .
COPY servers.json .

CMD ["node", "bot.js"]
