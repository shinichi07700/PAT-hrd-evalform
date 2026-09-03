# Build stage — compiles the Next.js app into a standalone server
FROM node:24-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build

# Runtime stage — minimal image with only what the standalone server needs
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# The database & app secret live in ./data — mounted as a volume in docker-compose
RUN mkdir -p data

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# Maintenance scripts (employee import from the Google Sheet, DB backup) so they
# can be run on the server with:  docker compose exec evalformhr node scripts/...
COPY --from=builder /app/scripts ./scripts

EXPOSE 3000
CMD ["node", "server.js"]
