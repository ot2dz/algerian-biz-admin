FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.15.0 --activate
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY artifacts/nafida-biz/package.json ./artifacts/nafida-biz/
COPY artifacts/mockup-sandbox/package.json ./artifacts/mockup-sandbox/
COPY scripts/package.json ./scripts/
COPY lib/db/package.json ./lib/db/
COPY lib/api-zod/package.json ./lib/api-zod/
COPY lib/api-client-react/package.json ./lib/api-client-react/
COPY lib/api-spec/package.json ./lib/api-spec/

RUN pnpm install --frozen-lockfile

COPY . .

ENV PORT=3000
ENV BASE_PATH=/
RUN pnpm run build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["pnpm", "--filter", "@workspace/api-server", "run", "start"]
