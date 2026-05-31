FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.15.0 --activate
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY artifacts/nafida-biz/package.json ./artifacts/nafida-biz/
COPY lib/db/package.json ./lib/db/

RUN pnpm install --frozen-lockfile

COPY . .

ENV PORT=3000
ENV BASE_PATH=/
RUN pnpm run build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["pnpm", "--filter", "@workspace/api-server", "run", "start"]
