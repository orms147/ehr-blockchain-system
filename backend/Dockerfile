# Backend (Node 20 ESM + Express + Prisma) — for local Docker Compose run
FROM node:20-alpine

# OpenSSL is required by the Prisma query engine on Alpine
RUN apk add --no-cache openssl

WORKDIR /app

# Install deps (use lockfile when present)
COPY package*.json ./
RUN npm ci || npm install

# App source + Prisma schema
COPY . .

# Generate the Prisma client for the container platform
RUN npx prisma generate

EXPOSE 3001

# Apply migrations then start the API
CMD ["sh", "-c", "npx prisma migrate deploy && node src/app.js"]
