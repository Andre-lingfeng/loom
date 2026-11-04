#!/usr/bin/env bash
# 一键安装：在全新的 Ubuntu 22.04 上把织识 Loom 跑起来
#
# 用法（在服务器上执行）：
#   bash deploy/install.sh                 # 交互式，会提示输入 API Key
#   DEEPSEEK_API_KEY=sk-xxx bash deploy/install.sh   # 非交互
#
# 重复执行是安全的：已装的内容会跳过，代码会更新后重建。

set -euo pipefail

REPO="${REPO:-https://github.com/Andre-lingfeng/loom.git}"
APP_DIR="${APP_DIR:-/opt/loom}"
PORT="${PORT:-3000}"
NODE_MAJOR="${NODE_MAJOR:-20}"

log() { printf '\n\033[1;36m▸ %s\033[0m\n' "$1"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$1"; }

if [ "$(id -u)" -eq 0 ]; then
  SUDO=""
else
  SUDO="sudo"
fi

log "1/6 安装系统依赖"
export DEBIAN_FRONTEND=noninteractive
$SUDO apt-get update -qq
$SUDO apt-get install -y -qq curl git ca-certificates

log "2/6 安装 Node ${NODE_MAJOR}"
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt "$NODE_MAJOR" ]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" > /tmp/nodesource.sh
  if [ -n "$SUDO" ]; then $SUDO -E bash /tmp/nodesource.sh; else bash /tmp/nodesource.sh; fi
  $SUDO apt-get install -y -qq nodejs
fi
node -v

log "3/6 安装 pnpm 与 pm2"
command -v pnpm >/dev/null 2>&1 || $SUDO npm i -g pnpm
command -v pm2 >/dev/null 2>&1 || $SUDO npm i -g pm2
pnpm -v

log "4/6 拉取代码"
if [ "${SKIP_GIT:-0}" = "1" ]; then
  echo "跳过代码拉取（使用已上传的代码）"
elif [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch --all -q
  git -C "$APP_DIR" reset --hard origin/main -q
else
  $SUDO mkdir -p "$APP_DIR"
  $SUDO chown "$(id -u):$(id -g)" "$APP_DIR"
  git clone -q "$REPO" "$APP_DIR"
fi
cd "$APP_DIR"

log "5/6 写环境变量并构建"
if [ -n "${DEEPSEEK_API_KEY:-}" ]; then
  KEY="$DEEPSEEK_API_KEY"
elif [ -t 0 ]; then
  printf '请粘贴你的 DEEPSEEK_API_KEY（直接回车可跳过，之后再补）：'
  read -r KEY
else
  KEY=""
fi

if [ -n "$KEY" ]; then
  umask 077
  printf 'DEEPSEEK_API_KEY=%s\n' "$KEY" > .env.production
  chmod 600 .env.production
  echo "已写入 .env.production（权限 600）"
else
  warn "没填 Key：页面能打开，云端功能会显示未配置"
fi

# 1G 内存的机器构建会 OOM，自动补 2G swap
MEM_MB=$(awk '/MemTotal/ {printf "%d", $2/1024}' /proc/meminfo)
if [ "$MEM_MB" -lt 1800 ] && [ ! -f /swapfile ]; then
  warn "内存 ${MEM_MB}MB，创建 2G swap"
  $SUDO fallocate -l 2G /swapfile || $SUDO dd if=/dev/zero of=/swapfile bs=1M count=2048
  $SUDO chmod 600 /swapfile
  $SUDO mkswap /swapfile >/dev/null
  $SUDO swapon /swapfile
fi

pnpm install --frozen-lockfile
pnpm build

log "6/6 启动服务"
pm2 delete loom >/dev/null 2>&1 || true
pm2 start pnpm --name loom -- start -- -p "$PORT"
pm2 save >/dev/null
$SUDO env PATH="$PATH" pm2 startup systemd -u "$(id -un)" --hp "$HOME" >/dev/null 2>&1 || \
  warn "开机自启需要手动执行：pm2 startup"

sleep 3
if curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
  IP=$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || echo "服务器公网IP")
  log "完成"
  echo "访问：http://${IP}:${PORT}"
  echo "体检：curl http://${IP}:${PORT}/api/health"
  echo "日志：pm2 logs loom"
else
  warn "服务没起来，看日志：pm2 logs loom --lines 50"
  exit 1
fi
