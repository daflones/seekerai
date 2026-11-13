FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm install --omit=dev || npm install
COPY src ./src
EXPOSE 8080
CMD ["npx", "tsx", "src/server.ts"]
