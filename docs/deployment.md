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
| `routes` | `modelinfo.dev` | 自定义域名 |

`public/_headers`：`/v1/*` 允许跨域、缓存 5 分钟；`/_astro/*`（带 hash 的静态资源）长期缓存。
`public/_redirects`：`/v1/models` 内部重写到 `/v1/models.json`。

## 自动部署（Cloudflare Workers Builds）

Cloudflare 直接连接 GitHub 仓库 `Owlbay/modelinfo`，`main` 每次更新后在 Cloudflare 构建并发布，GitHub 不保存任何 Cloudflare 凭据。

Cloudflare Dashboard → Workers & Pages → `modelinfo` → Settings → Build：

| 项 | 值 |
| --- | --- |
| Git 仓库 | `Owlbay/modelinfo`，生产分支 `main` |
| Build command | `pnpm build` |
| Deploy command | `npx wrangler deploy` |
| Root directory | `/` |

站点地址默认 `https://modelinfo.dev`（`astro.config.mjs`），需要改成其他地址时在构建环境变量里设置 `SITE_URL`。

## 自定义域名

`wrangler.jsonc` 的 `routes` 已绑定 `modelinfo.dev`（`custom_domain: true`）。域名托管在同一 Cloudflare 账号下时，首次部署会自动创建 DNS 记录与证书。

## 检查（GitHub Actions）

`.github/workflows/ci.yml` 在推送与 PR 时运行数据校验、`pnpm check` 与 `pnpm build`，不负责发布。PR 合并前需要通过。

## 本地手动发布

```bash
pnpm exec wrangler login
pnpm deploy
```

## 其他托管

`dist/` 可交给任意静态托管。需要等价配置：`/v1/models` 重写到 `/v1/models.json`、`/v1/*` 的 `Access-Control-Allow-Origin: *`、目录地址补全尾斜杠、404 返回 `404.html`。
