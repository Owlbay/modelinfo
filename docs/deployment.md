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

## 发布（打标签）

只有推送 `v*` 标签才会发布，`main` 的日常提交不上线。版本号用语义化版本：界面或接口新增功能升次版本号，修复与数据更新升修订号。

```bash
git switch main && git pull
git tag -a v1.1.0 -m "v1.1.0"
git push origin v1.1.0
```

`.github/workflows/release.yml` 随后：

1. 确认标签所在提交已在 `main` 上；
2. 运行数据校验、`pnpm check`、`pnpm build`，任一失败即停止；
3. 把该提交强制推送到 `release` 分支，Cloudflare Workers Builds 据此构建并发布；
4. 创建同名 GitHub Release，说明由提交记录自动生成。

回滚：对旧提交打一个新标签（如 `v1.1.1`）推送即可；也可以在 Cloudflare Dashboard 的 Deployments 里直接回滚到旧版本。

## Cloudflare Workers Builds

Cloudflare 直接连接 GitHub 仓库 `Owlbay/modelinfo`，生产分支为 `release`，GitHub 不保存任何 Cloudflare 凭据。

Cloudflare Dashboard → Workers & Pages → `modelinfo` → Settings → Build：

| 项 | 值 |
| --- | --- |
| Git 仓库 | `Owlbay/modelinfo`，生产分支 `release` |
| Build command | `pnpm build` |
| Deploy command | `npx wrangler deploy` |
| Root directory | `/` |

站点地址默认 `https://modelinfo.dev`（`astro.config.mjs`），需要改成其他地址时在构建环境变量里设置 `SITE_URL`。

## 自定义域名

`wrangler.jsonc` 的 `routes` 已绑定 `modelinfo.dev`（`custom_domain: true`）。域名托管在同一 Cloudflare 账号下时，首次部署会自动创建 DNS 记录与证书。

## 检查（GitHub Actions）

`.github/workflows/ci.yml` 在推送与 PR 时运行数据校验、`pnpm check` 与 `pnpm build`，不负责发布（发布见上文）。PR 合并前需要通过。

## 本地手动发布

```bash
pnpm exec wrangler login
pnpm deploy
```

## 其他托管

`dist/` 可交给任意静态托管。需要等价配置：`/v1/models` 重写到 `/v1/models.json`、`/v1/*` 的 `Access-Control-Allow-Origin: *`、目录地址补全尾斜杠、404 返回 `404.html`。
