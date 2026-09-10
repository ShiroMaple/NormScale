#!/usr/bin/env bash
set -Eeuo pipefail

# 确保加载 nvm 与 Node 22 LTS 环境
export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
    # shellcheck source=/dev/null
    . "$NVM_DIR/nvm.sh"
    nvm use 22 > /dev/null 2>&1 || true
fi

TARGET_DIR="/var/www/NormScale"
RELEASE_TAR="${1:-/tmp/normscale-release.tar.gz}"

echo "========================================="
echo "== NormScale 生产环境自动化部署启动 =="
echo "========================================="
echo "目标目录: ${TARGET_DIR}"
echo "发布文件: ${RELEASE_TAR}"
echo "Node版本: $(node -v)"
echo "pnpm版本: $(pnpm -v)"

mkdir -p "${TARGET_DIR}"
cd "${TARGET_DIR}"

# 1. 保护生产 .env 配置文件
if [ ! -f "${TARGET_DIR}/.env" ] && [ -f "${TARGET_DIR}/.env.example" ]; then
    echo "未检测到生产 .env，从 .env.example 初始化模板..."
    cp "${TARGET_DIR}/.env.example" "${TARGET_DIR}/.env"
fi

# 2. 解压发布归档包
if [ -f "${RELEASE_TAR}" ]; then
    echo "解压发布包 ${RELEASE_TAR} 到 ${TARGET_DIR} ..."
    tar -xzf "${RELEASE_TAR}" -C "${TARGET_DIR}"
    rm -f "${RELEASE_TAR}"
else
    echo "未指定新的发布包，使用目录内既有文件部署..."
fi

# 3. 安装生产依赖
echo "安装生产依赖 (pnpm install --prod)..."
pnpm config set registry https://registry.npmmirror.com || true
pnpm install --prod --frozen-lockfile || pnpm install --prod

# 4. PM2 进程守护重载 / 启动
echo "检查并管理 PM2 守护进程..."
if pm2 describe NormScale > /dev/null 2>&1; then
    echo "重载运行中的 PM2 进程 NormScale..."
    pm2 reload ecosystem.config.cjs --update-env || pm2 restart NormScale --update-env
else
    echo "首次在 PM2 中启动 NormScale..."
    pm2 start ecosystem.config.cjs
fi

pm2 save

# 5. 本地 4006 端口冒烟健康检查
echo "等待服务稳定 (3秒)..."
sleep 3
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4006 || echo "000")
echo "HTTP 状态码: ${HTTP_STATUS}"
if [[ "$HTTP_STATUS" =~ ^(200|301|302|307|308|404)$ ]]; then
    echo "健康检查通过! 端口 4006 正常响应。"
else
    echo "警告: 端口 4006 未返回预期状态码，请执行 'pm2 logs NormScale --lines 50' 排查。"
fi

echo "========================================="
echo "== NormScale 部署执行完毕 =="
echo "========================================="
