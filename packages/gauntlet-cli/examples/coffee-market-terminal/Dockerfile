FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY data ./data
USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
