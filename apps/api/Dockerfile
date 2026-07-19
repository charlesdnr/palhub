# Build depuis la racine du monorepo :
#   docker build -f apps/api/Dockerfile .
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
# npm ci exige tous les workspaces du lockfile : le manifest de web suffit
COPY apps/web/package.json ./apps/web/package.json
RUN npm ci --no-audit --no-fund
RUN npm run build -w @palhub/shared \
    && npx prisma generate --schema apps/api/prisma/schema.prisma \
    && npm run build -w api

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
# Exécution non-root (l'utilisateur `node` existe dans l'image officielle).
USER node
EXPOSE 3000
# migrations au démarrage, puis l'API
CMD ["sh", "-c", "npx prisma migrate deploy --schema apps/api/prisma/schema.prisma && node apps/api/dist/main.js"]
