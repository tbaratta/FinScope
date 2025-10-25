# Node API Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json ./
# Use npm install to avoid strict lockfile sync issues inside CI/containers
RUN npm install --no-fund --no-audit
COPY . .
EXPOSE 4000
CMD ["npm", "start"]
