FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# Data directory persisted via a mounted volume in production
RUN mkdir -p /app/data
VOLUME ["/app/data"]

ENV PORT=4000
EXPOSE 4000

CMD ["node", "src/server.js"]
