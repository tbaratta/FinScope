# Frontend Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
RUN if [ -f package-lock.json ]; then npm ci; elif [ -f pnpm-lock.yaml ]; then npm i -g pnpm && pnpm i --frozen-lockfile; elif [ -f yarn.lock ]; then yarn install --frozen-lockfile; else npm install; fi
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app /app
EXPOSE 5173
CMD ["npm", "run", "preview"]
