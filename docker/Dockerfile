FROM node:18-alpine

WORKDIR /app

# 后端
COPY server/package*.json ./server/
RUN cd server && npm install --production

# 前端
COPY client/package*.json ./client/
RUN cd client && npm install

COPY server/ ./server/
COPY client/ ./client/

# 构建前端
RUN cd client && npm run build

EXPOSE 3000

CMD ["node", "server/src/index.js"]
