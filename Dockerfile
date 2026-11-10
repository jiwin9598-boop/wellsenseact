# Stage 1: Build frontend
FROM node:22-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Backend
FROM node:22-alpine
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --production
COPY backend/ ./
COPY --from=frontend /app/frontend/dist ./frontend/dist

ENV PORT=3000
ENV DB_FILE=/data/wellsense.db
EXPOSE 3000


CMD ["node", "src/server.js"]
