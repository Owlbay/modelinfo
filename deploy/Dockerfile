# 自托管镜像：构建时采集数据，运行时只有 Caddy + 静态文件。
#   docker build -f deploy/Dockerfile -t modelinfo .
#   docker run -p 8080:80 modelinfo
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm sync && pnpm build

FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
