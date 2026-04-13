# Stage 1: Build React client
FROM node:20-alpine AS builder
WORKDIR /app
COPY shared/ ./shared/
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# Stage 2: Production server
FROM node:20-alpine
WORKDIR /app

# Copy server
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev
COPY server/ ./server/

# Copy shared modules (imported by server at runtime)
COPY shared/ ./shared/

# Copy game assets
COPY questions.json ./
COPY songs.json ./
COPY lyrics.json ./
COPY audio/ ./audio/

# Copy built React app
COPY --from=builder /app/client/dist ./client/dist

EXPOSE 3000
CMD ["node", "server/src/index.js"]
