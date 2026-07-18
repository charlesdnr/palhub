# Build depuis la racine du monorepo :
#   docker build -f apps/web/Dockerfile .
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
COPY apps/api/package.json ./apps/api/package.json
RUN npm ci --no-audit --no-fund
RUN npm run build -w @palhub/shared && npm run build -w web

FROM nginx:alpine
COPY infra/nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist/web/browser /usr/share/nginx/html
EXPOSE 80
