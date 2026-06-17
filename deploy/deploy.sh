#!/usr/bin/env bash
# tinyowl 一键部署：本地构建 linux/amd64 镜像 → 导出 → 传输 → 服务器 load + up
# 服务器不编译、不拉 git，全部产物本地构建。
#
# 用法：在仓库根目录执行
#   SERVER=root@<服务器IP> ./deploy/deploy.sh
#
# 依赖：本地 docker（已启动）、ssh/scp 到目标服务器免密。
set -euo pipefail

# ---- 配置 ----
# 目标服务器，通过环境变量传入，例如：SERVER=root@your.server.ip
SERVER="${SERVER:?请通过环境变量指定目标服务器，例如 SERVER=root@your.server.ip}"
REMOTE_DIR="${REMOTE_DIR:-/opt/tinyowl}"
PLATFORM="linux/amd64"          # 服务器为 amd64，本地若为 arm64 必须交叉构建
BACKEND_IMG="tinyowl-backend:latest"
WEB_IMG="tinyowl-web:latest"

# 切到仓库根目录（脚本在 deploy/ 下）
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
echo "▶ 仓库根目录: $ROOT"

if [[ ! -f deploy/.env ]]; then
  echo "✖ 缺少 deploy/.env（含 ADMIN_PASSWORD 等），请先创建。" >&2
  exit 1
fi

# ---- 1. 构建镜像（指定 amd64 平台）----
echo "▶ [1/5] 构建后端镜像 ($PLATFORM)..."
docker buildx build --platform "$PLATFORM" --load \
  -f deploy/Dockerfile -t "$BACKEND_IMG" .

echo "▶ [1/5] 构建前端/nginx 镜像 ($PLATFORM)..."
docker buildx build --platform "$PLATFORM" --load \
  -f deploy/Dockerfile.web -t "$WEB_IMG" .

# ---- 2. 导出镜像为压缩包 ----
echo "▶ [2/5] 导出镜像 tar.gz..."
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
docker save "$BACKEND_IMG" "$WEB_IMG" | gzip > "$TMP/tinyowl-images.tar.gz"
echo "  镜像包大小: $(du -h "$TMP/tinyowl-images.tar.gz" | cut -f1)"

# ---- 3. 传输镜像 + 编排文件 ----
echo "▶ [3/5] 传输到 $SERVER:$REMOTE_DIR ..."
ssh "$SERVER" "mkdir -p $REMOTE_DIR"
scp "$TMP/tinyowl-images.tar.gz" "$SERVER:$REMOTE_DIR/"
scp deploy/docker-compose.yml "$SERVER:$REMOTE_DIR/docker-compose.yml"
scp deploy/.env "$SERVER:$REMOTE_DIR/.env"

# ---- 4. 服务器 load 镜像 ----
echo "▶ [4/5] 服务器载入镜像..."
ssh "$SERVER" "cd $REMOTE_DIR && gunzip -c tinyowl-images.tar.gz | docker load && rm -f tinyowl-images.tar.gz"

# ---- 5. 启动 ----
echo "▶ [5/5] 启动容器..."
ssh "$SERVER" "cd $REMOTE_DIR && docker compose up -d && docker compose ps"

echo "✔ 部署完成。访问 https://tinyowl.cn"
