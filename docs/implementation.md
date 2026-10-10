# ModelInfo 实现架构

## 1. 总体：构建时生成，运行时纯静态

```text
GitHub Actions（定时 / push / 手动）
  ├─ pnpm typecheck && pnpm test
  ├─ pnpm sync    采集 + 校验 + 生成 public/v1、public/data
  ├─ pnpm build   vite build → dist/（含 public/ 下全部文件）
  └─ deploy-cf    wrangler deploy → Cloudflare Workers Static Assets → 自定义域名
```

线上没有服务进程和数据库，只有静态文件。同一份 `dist/` 也可以直接交给 Caddy/Nginx、Docker 镜像或对象存储托管。

## 2. 双目录数据链

```text
OpenAI / Anthropic / Google 官方文档
          │ 人工核验并记录字段来源
          ▼
data/official/*.ts ── 校验 ──▶ /v1/models.json
                               /v1/providers/{provider}/models.json

models.dev + OpenRouter
          │ CI 定时采集、归一化、合并
          ▼
/data/index.<version>.json            网站列表精简索引
/data/providers/<id>.<version>.json   按 Provider 分片的完整 Offering
```

正式 API 和网站发现目录是两条独立的数据链：聚合目录出现新模型，也不会未经审核进入公开接口。

## 3. 代码边界

| 路径 | 职责 |
|---|---|
| `data/official/official-models.ts` | Canonical Model 官方事实 |
| `data/official/provider-models.ts` | Provider 模型 ID、API、参数、价格与覆盖 |
| `scripts/lib/official.ts` | 官方数据校验、合并视图、版本 Hash |
| `scripts/lib/upstream.ts` | models.dev / OpenRouter 采集与归一化 |
| `scripts/sync.ts` | 生成全部静态 JSON 与 `/v1/meta.json` |
| `src/lib/catalog.ts` | 精简索引生成、筛选、Facet，构建脚本与前端共用 |
| `src/catalog-types.ts` | 共用 TypeScript 类型 |
| `public/_headers`、`public/_redirects` | Cloudflare 响应头与路径重写 |
| `deploy/Caddyfile`、`deploy/Dockerfile` | 自托管等价配置 |

## 4. 同步与发布守卫

`pnpm sync` 默认严格模式：

- 官方数据校验失败（ID 重复、缺少 HTTPS 来源、引用不存在等）直接失败；
- models.dev 或 OpenRouter 任一不可用直接失败；
- 配置了 `SITE_URL` 时读取线上 `/v1/meta.json`：可见记录数低于线上的 70%（`MIN_RETAIN_RATIO`）则失败；
- 数据版本与线上一致时输出 `changed=false`，定时任务跳过部署。

任何一步失败都不会部署，线上继续提供上一次成功发布的文件，这替代了原来的运行时 stale 缓存。本地开发可用 `pnpm sync:dev`，上游不可用时降级到内置样例。

版本号是内容 Hash，忽略 `retrieved_at` / `verified_at`，因此只有数据本身变化才会产生新版本。

## 5. 缓存

| 路径 | Cache-Control |
|---|---|
| `/v1/meta.json` | `max-age=60, must-revalidate` |
| `/v1/*` | `max-age=300, stale-while-revalidate=3600` |
| `/data/*`、`/assets/*` | `max-age=31536000, immutable`（文件名含版本号） |

前端先以 `no-cache` 读取 `/v1/meta.json`，再按其中的文件路径加载索引；若部署切换导致旧索引 404，会强制刷新 meta 后重试一次。

## 6. UI

网站一次性加载精简索引（约 8 千条，gzip 后约 250 KB），筛选、计数和分页全部在浏览器内完成。默认只显示 `active`、`beta` 状态。完整 Offering（价格阶梯、推理控制、来源等）按 Provider 分片发布，供后续详情页或外部使用。

## 7. 部署目标

- **Cloudflare**：`wrangler.jsonc` 的 `assets.directory = ./dist`；取消注释 `routes` 并填写域名即可绑定自定义域名。CI 需要 `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID` 两个 Secret。
- **自托管**：`docker build -f deploy/Dockerfile -t modelinfo .`，或把 CI 产出的 `site` artifact rsync 到服务器由 Caddy 托管；可配合 Cloudflare Tunnel 接入。新增部署目标时在 workflow 中增加 job，复用同一份 artifact。

## 8. 已知取舍与后续

- 公开接口不支持查询参数筛选与分页；如需兼容，可增加一个只处理 `/v1/models` 的轻量 Worker，读取同一份静态数据；
- 数据新鲜度取决于定时间隔（默认 6 小时，GitHub 定时任务可能延迟）；
- 为 Azure OpenAI、Vertex AI、AWS Bedrock、OpenRouter 增加 Provider Model；
- 发布 JSON Schema 与 OpenAPI 文档；保存历史版本以支持价格和能力变更审计。
