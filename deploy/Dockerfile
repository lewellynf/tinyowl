# tinyowl 后端镜像（多阶段构建）
# 阶段一：安装全部依赖并编译（含 better-sqlite3 原生模块、shared/backend 的 tsc）
# 阶段二：仅保留生产依赖 + 编译产物，体积更小

# ---------- builder ----------
FROM node:22-bookworm AS builder

# better-sqlite3 需要 python3 + make + g++ 编译原生模块
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.33.4 --activate

WORKDIR /app

# 先拷贝 workspace 清单，利用层缓存
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/backend/package.json packages/backend/

# 安装 shared + backend 的依赖（不含 frontend，前端单独构建）
# pnpm 10 默认忽略依赖的安装脚本，需显式 rebuild 才能编译 better-sqlite3 原生模块
RUN pnpm install --frozen-lockfile --filter @tinyowl/shared... --filter @tinyowl/backend... \
    && pnpm --filter @tinyowl/backend rebuild better-sqlite3

# 拷贝源码并构建 shared + backend
COPY packages/shared packages/shared
COPY packages/backend packages/backend
RUN pnpm --filter @tinyowl/shared build \
    && pnpm --filter @tinyowl/backend build

# shared 的 package.json exports 指向 .ts 源码，生产 Node 无法解析，改写为指向编译产物
RUN node -e "const f='packages/shared/package.json';const p=require('./'+f);p.exports={'.':{types:'./dist/index.d.ts',default:'./dist/index.js'}};require('fs').writeFileSync(f,JSON.stringify(p,null,2));"

# 重新部署生产依赖到独立目录（去掉 devDependencies）
RUN pnpm --filter @tinyowl/backend deploy --prod --legacy /app/prod-backend

# 确保 prod 树内 better-sqlite3 原生模块已编译（deploy 后在 builder 内再编译一次，runtime 镜像无编译工具）
RUN cd /app/prod-backend && npm rebuild better-sqlite3

# ---------- runtime ----------
FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

# 拷贝 backend 生产部署（含已编译的 shared 与 node_modules）
COPY --from=builder /app/prod-backend ./

# 数据目录（SQLite 持久化挂载点）
RUN mkdir -p /app/data
ENV DB_PATH=/app/data/tinyowl.sqlite

EXPOSE 3000
CMD ["node", "dist/server.js"]
