# 部署说明（DEPLOY）

> 目标：让评审**点开就能用**，且不需要任何人填 API Key。
> 预计耗时：**20–30 分钟**（Vercel）；国内可选 EdgeOne。

---

## 一、部署前检查（本地跑一遍）

```bash
pnpm verify        # 8/8 + 类型 + 测试
pnpm build         # 生产构建
pnpm start -p 3000 # 本地生产模式

curl http://127.0.0.1:3000/api/health
```

`/api/health` 会返回云端能力是否就绪（只报告"有/没有"，不泄露密钥）：

```json
{
  "ok": true,
  "runtime": "vercel",
  "features": {
    "cloud": { "relations": true, "generate": true, "vision": false }
  },
  "hint": "云端能力已就绪"
}
```

---

## 二、环境变量

在平台的 Environment Variables 里配置（**不要提交到仓库**）：

| 变量 | 必填 | 说明 |
|---|---|---|
| `DEMO_TOKEN_BUDGET` | 300000 | 共享 Key 每天可用 token 总量，用尽后提示用户自行配置 |
| `DEEPSEEK_API_KEY` | 是 | 演示用共享 Key。评审不用自己填 |
| `DEEPSEEK_BASE_URL` | 否 | 默认 `https://api.deepseek.com/v1` |
| `DEEPSEEK_MODEL` | 否 | 默认 `deepseek-chat` |
| `VISION_API_KEY` | 否 | 图片入库用；留空则复用上面的 Key |
| `VISION_BASE_URL` | 否 | 例如智谱 `https://open.bigmodel.cn/api/paas/v4` |
| `VISION_MODEL` | 否 | 例如 `glm-4v-flash` |
| `DEMO_QUOTA_PER_IP` | 否 | 每 IP 每天云端调用上限，默认 20 |
| `DEMO_QUOTA_GLOBAL` | 否 | 全局每天上限，默认 300 |

**额度逻辑**：用户自己在 `/kb/settings` 填了 Key 就**不限流**；没填才用共享 Key 并计数。

按 100 位评审 × 3 次估算，整个评审期约 **¥3**。

---

## 三、Vercel（推荐，最省事）

1. 把仓库推到 GitHub（Public）
2. [vercel.com/new](https://vercel.com/new) → 导入该仓库
3. **Root Directory** 设成 `agent-studio`（仓库根目录不是 Next 应用）
4. Framework 自动识别为 Next.js，构建命令保持默认
5. 在 **Environment Variables** 里填上面那张表
6. Deploy，拿到 `https://xxx.vercel.app`

部署后自检：

```bash
curl https://xxx.vercel.app/api/health
```

应当返回 `ok: true` 且 `cloud.relations: true`。

### 注意事项

- **不需要数据库**：所有数据在浏览器 localStorage
- **PDF 上限 4MB**：Vercel 单请求硬上限 4.5MB，已按平台自动收紧并给出手动提示
- **函数超时**：`/api/relations`、`/api/generate` 都设了 60s 超时，Vercel Hobby 默认 10s 可能不够——若报超时，在项目 Settings → Functions 里把 Max Duration 调到 60

---

## 四、腾讯云 EdgeOne（国内访问更快）

1. 开通 EdgeOne Pages，关联 GitHub 仓库
2. 构建命令 `pnpm build`，输出目录 `.next`，Root Directory 填 `agent-studio`
3. 环境变量同上
4. 绑定平台提供的默认域名（**无需备案**；自定义域名才需要）

---

## 五、上线后回归清单

按顺序点一遍，5 分钟：

| # | 操作 | 期望 |
|---|---|---|
| 1 | 打开 `/` | 星空动画流畅，按钮可点 |
| 2 | 点「查看产品演示」 | 4 步弹窗，翻页正常 |
| 3 | 进 `/kb` | 8 条素材，无报错 |
| 4 | 添加素材 → 粘贴一段文字 | 入库并跳到图谱 |
| 5 | 关联页点「云端重算」 | 出现关系类型（支持/矛盾/…） |
| 6 | 冲突页 | 若有矛盾，能选并入 / 并存 |
| 7 | 简报 | 未处理冲突时锁定 |
| 8 | `/kb/settings` | 可填 Key、可测连接 |
| 9 | 手机打开 | 顶部标签条可切换视图 |
| 10 | `/api/health` | `ok: true` |

---

## 六、常见问题

**Q：部署后云端功能报「未配置模型」？**
A：环境变量没生效。Vercel 修改环境变量后**必须重新部署**才生效。

**Q：演示 Key 会被刷吗？**
A：共享 Key 有每 IP 20 次 / 全局 300 次的上限；超了会提示用户自己填 Key。内存计数在 serverless 多实例下是近似值，不是计费级限流。

**Q：评审期间要一直在线吗？**
A：规则要求"评审期间保持服务可用"，评审到 2027 年 1 月底。Vercel 免费档足够；注意 Key 余额别用试用额度。

**Q：数据会丢吗？**
A：每个访客的数据在各自浏览器里，互不影响；换设备/清缓存会丢。这是已知限制，文档里应写明。
