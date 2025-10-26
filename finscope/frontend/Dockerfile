# Frontend Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
# Copy lockfiles first and install with npm ci for reproducible builds
COPY package.json package-lock.json ./
# Prefer reproducible installs; if lockfile is out of sync (hackathon speed), fall back to npm install
RUN npm ci --no-fund --no-audit || npm install --no-fund --no-audit
COPY . .
# Inject Vite env at build-time so import.meta.env has values in the built app
ARG VITE_API_BASE_URL
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_KEY
ARG VITE_AUTH_PROVIDER
ARG VITE_PY_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
	VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
	VITE_SUPABASE_KEY=$VITE_SUPABASE_KEY \
	VITE_AUTH_PROVIDER=$VITE_AUTH_PROVIDER \
	VITE_PY_API_BASE_URL=$VITE_PY_API_BASE_URL
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app /app
EXPOSE 5173
CMD ["npm", "run", "preview"]
