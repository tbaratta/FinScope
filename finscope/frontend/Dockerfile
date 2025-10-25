# Frontend Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
RUN npm install --no-fund --no-audit
COPY . .
# Inject Vite env at build-time so import.meta.env has values in the built app
ARG VITE_API_BASE_URL
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_KEY
ARG VITE_AUTH_PROVIDER
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
	VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
	VITE_SUPABASE_KEY=$VITE_SUPABASE_KEY \
	VITE_AUTH_PROVIDER=$VITE_AUTH_PROVIDER
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app /app
EXPOSE 5173
CMD ["npm", "run", "preview"]
