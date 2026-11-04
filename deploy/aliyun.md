# 阿里云部署（国内访问，两种路径）

> 面向：评委/导员在国内网络访问。国外 PaaS（Vercel）在国内常连不上，阿里云没有这个问题。

## 先说备案

- 用**阿里云提供的默认域名**（函数计算的 `*.fcapp.run`）或**服务器 IP + 非 80 端口** → **不需要备案**
- 用**自己的域名**指向国内服务器 → **需要 ICP 备案**（7–20 天）

竞赛演示不必等备案，先用默认地址即可。

---

## 方案 A：轻量应用服务器（推荐，最稳）

**为什么推荐**：`pnpm start` 在本地能跑通，服务器上一定跑得通，不存在平台适配问题。

### 1. 买服务器

阿里云 → 轻量应用服务器：

| 项 | 选择 |
|---|---|
| 地域 | 华东1（杭州）或离你近的 |
| 镜像 | **Ubuntu 22.04** |
| 规格 | **2 核 2G**（1G 也能跑，构建时加 swap） |
| 带宽 | 3M 起 |

### 2. 放通端口

控制台 → 防火墙：放通 `22`、`80`、`443`（或临时放通 `3000`）

### 3. 按 deploy/README.md 操作

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git
sudo npm i -g pnpm pm2

git clone https://github.com/Andre-lingfeng/loom.git /opt/loom
cd /opt/loom && pnpm install && pnpm build
```

### 4. 环境变量

```bash
sudo tee /opt/loom/.env.production > /dev/null <<'EOF'
DEEPSEEK_API_KEY=sk-你的Key
EOF
sudo chmod 600 /opt/loom/.env.production
```

### 5. 常驻

```bash
cd /opt/loom
pm2 start pnpm --name loom -- start -- -p 3000
pm2 save && pm2 startup
```

访问 `http://服务器公网IP:3000` 即可。
有域名的话按 `deploy/Caddyfile` 配 HTTPS。

---

## 方案 B：函数计算 FC（不用服务器，按量计费）

适合「不想维护机器」。用容器镜像，代码不用改（仓库已有 `Dockerfile`）。

### 1. 云端构建镜像

本机没装 Docker 也能做——阿里云容器镜像服务（ACR）支持云端构建：

1. ACR 控制台 → 创建**个人版实例** → 命名空间（如 `loom`）
2. 创建镜像仓库 `loom`，选择「**从 GitHub 构建**」或「本地构建」
3. 绑定 GitHub 仓库 `Andre-lingfeng/loom`，Dockerfile 路径填 `/Dockerfile`
4. 触发构建，得到镜像地址：
   `registry.cn-hangzhou.aliyuncs.com/loom/loom:latest`

### 2. 创建函数

函数计算 FC → 创建函数 → **容器镜像**：

| 配置 | 值 |
|---|---|
| 镜像 | 上面那条地址 |
| 监听端口 | `3000` |
| 内存 | 1 GB |
| 超时时间 | **60 秒**（云端分析要用） |
| 实例并发 | 10 |

环境变量：`DEEPSEEK_API_KEY=sk-...`

### 3. 触发器

创建 HTTP 触发器 → 得到 `https://xxx.fcapp.run` 公网地址。

### 4. 注意

- 容器里跑的是 Next.js **standalone** 产物（`BUILD_STANDALONE=1` 已写进 Dockerfile）
- 首次冷启动约 3–8 秒，之后常驻
- FC 免费额度（每月 40 万 CU·秒）对演示完全够

---

## 部署后必须验证的 4 项

```
1. /api/health            → cloud 是否 ready
2. /kb 页面能打开
3. 关联页「云端重算」      → 60 秒内返回
4. 添加素材 → 文件 → PDF   → 能解析出正文
```

第 4 项在容器/服务器上都应正常（用的是 `unpdf`，纯 Node 依赖）。
如果走了边缘运行时（非 Node），PDF 会失败——这也是我推荐方案 A 的原因。

---

## 成本

| 方案 | 费用 | 时间 |
|---|---|---|
| A 轻量服务器 | 约 ¥100/年（新用户更低） | 30 分钟 |
| B 函数计算 | 演示期基本免费 | 40 分钟 |

---

## 出问题先看这里

| 现象 | 排查 |
|---|---|
| 页面 502 | `pm2 logs loom`，多半是没 build 或端口不对 |
| 云端功能全报错 | 环境变量没生效：`pm2 restart loom --update-env` |
| 构建被 OOM 杀掉 | 加 2G swap |
| 从 GitHub clone 很慢 | 用 `https://gitee.com` 镜像导入，或先在本地打包 `git bundle` 传上去 |
