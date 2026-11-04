# 自建服务器部署（国内可访问，无平台限制）

适合：评委/导员在国内网络访问，或不想依赖 PaaS 的账号体系。
成本：一台轻量服务器约 ¥100/年。

## 一、准备服务器

腾讯云 / 阿里云「轻量应用服务器」，配置够用即可：

- 镜像：**Ubuntu 22.04**
- 规格：**2 核 2G**（1G 也能跑，但构建会吃满内存）
- 带宽：3M 起
- 放通端口：`22`、`80`、`443`

## 二、装环境（一次性）

```bash
# Node 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git
sudo npm i -g pnpm pm2

# Caddy（自动申请 HTTPS，比 nginx 省事）
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

## 三、拉代码并构建

```bash
git clone https://github.com/Andre-lingfeng/loom.git /opt/loom
cd /opt/loom
pnpm install
pnpm build
```

## 四、配置环境变量

```bash
sudo tee /opt/loom/.env.production > /dev/null <<'EOF'
DEEPSEEK_API_KEY=sk-你的Key
EOF
sudo chmod 600 /opt/loom/.env.production
```

## 五、用 pm2 常驻

```bash
cd /opt/loom
pm2 start pnpm --name loom -- start -- -p 3000
pm2 save
pm2 startup          # 按提示复制输出的那条命令执行，开机自启
```

检查：

```bash
curl -s http://127.0.0.1:3000/api/health
```

## 六、Caddy 反向代理 + HTTPS

把 `deploy/Caddyfile` 复制到服务器，改掉域名：

```bash
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile      # 把 loom.example.com 换成你的域名
sudo systemctl reload caddy
```

**没有域名也能用**：直接访问 `http://服务器IP:3000`，但需要放通 3000 端口，
且没有 HTTPS。演示够用，正式提交建议绑域名。

## 七、更新版本

```bash
cd /opt/loom && git pull && pnpm install && pnpm build && pm2 restart loom
```

## 常见问题

| 现象 | 原因 |
|---|---|
| 构建时内存不足被杀 | 加 swap：`sudo fallocate -l 2G /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile` |
| 打开是 502 | Node 没起来，看 `pm2 logs loom` |
| HTTPS 申请失败 | 域名没解析到这台机器，或 80 端口没放通 |
| 云端功能全报错 | `.env.production` 没生效，`pm2 restart loom --update-env` |
