# 部署

站点是纯静态文件，部署到 Cloudflare Workers Static Assets：没有 Worker 脚本、没有存储绑定，请求全部由 Cloudflare 边缘直接返回静态文件。

## 配置

`wrangler.jsonc`：

| 字段 | 值 | 说明 |
| --- | --- | --- |
| `name` | `modelinfo` | Worker 名称，决定默认地址 `modelinfo.<账号子域>.workers.dev` |
| `assets.directory` | `./dist` | 构建产物目录 |
| `assets.html_handling` | `auto-trailing-slash` | `/models` 自动补全为 `/models/` |
| `assets.not_found_handling` | `404-page` | 未命中时返回 `dist/404.html` |
| `routes` | 默认注释 | 绑定自定义域名时启用 |

`public/_headers`：`/v1/*` 允许跨域、缓存 5 分钟；`/_astro/*`（带 hash 的静态资源）长期缓存。
`public/_redirects`：`/v1/models` 内部重写到 `/v1/models.json`。

## 自动部署（GitHub Actions）

`.github/workflows/deploy.yml`：

- 推送到 `main`：检查 → 构建 → `wrangler deploy`。
- Pull Request：只检查与构建，不发布。
- 也可在 Actions 页面手动触发。

需要在 GitHub 仓库 Settings → Secrets and variables → Actions 配置：

| 类型 | 名称 | 说明 |
| --- | --- | --- |
| Secret | `CLOUDFLARE_API_TOKEN` | Cloudflare API Token，模板「Edit Cloudflare Workers」；绑定自定义域名还需要该域名 Zone 的 DNS 与 Workers Routes 编辑权限 |
| Secret | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账号 ID（Dashboard 右侧栏） |
| Variable | `SITE_URL` | 站点正式地址，如 `https://models.example.com`；用于 canonical、hreflang 与文档中的接口地址 |

## 绑定自定义域名

前提：域名已托管在 Cloudflare（DNS 由 Cloudflare 解析）。

1. 在 `wrangler.jsonc` 取消 `routes` 注释，填写域名：
   ```jsonc
   "routes": [{ "pattern": "models.example.com", "custom_domain": true }]
   ```
2. 仓库变量 `SITE_URL` 设为 `https://models.example.com`。
3. 推送到 `main`。`wrangler deploy` 会自动创建 DNS 记录与证书。

## 本地手动发布

```bash
pnpm exec wrangler login
SITE_URL=https://models.example.com pnpm deploy
```

## 其他托管

`dist/` 可交给任意静态托管。需要等价配置：`/v1/models` 重写到 `/v1/models.json`、`/v1/*` 的 `Access-Control-Allow-Origin: *`、目录地址补全尾斜杠、404 返回 `404.html`。
