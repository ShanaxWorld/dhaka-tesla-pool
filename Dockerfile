# ---- deps: install node modules ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder: generate prisma client + build next ----
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN DISABLE_ERD=true npx prisma generate
RUN npm run build

# ---- runner: minimal image that runs the app ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Prisma schema + migrations for migrate/seed at startup.
COPY --from=builder /app/prisma ./prisma
# Full node_modules so the Prisma CLI (and its wasm engine), tsx, and bcryptjs all resolve.
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000
CMD ["node", "server.js"]