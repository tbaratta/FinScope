# Frontend Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
RUN npm install --no-fund --no-audit
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app /app
EXPOSE 5173
CMD ["npm", "run", "preview"]
