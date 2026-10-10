# ModelInfo

ModelInfo 是一个面向开发者的 AI 模型与 Provider 目录。

同一个模型可以由多个 Provider 提供，每个 Provider 可以拥有不同的模型 ID、价格、上下文限制、调用协议和生命周期状态。ModelInfo 把这些信息整理成统一、可追溯来源的目录。

## 项目目标

- 记录与展示 Provider 无关的模型本体信息。
- 记录不同 Provider 实际提供模型时的价格、限制和请求差异。
- 提供稳定、可缓存、可筛选的 `/v1/models` 接口。
- 为模型选择器、API 网关、客户端 SDK、费用估算和模型对比提供统一数据源。
- 保留信息来源、验证时间和可信状态，避免将未知数据伪装成确定数据。

## 核心关系

```text
Lab / 模型研发方
       │
       └── 1:N ── Canonical Model / 模型本体
                         │
                         └── N:M ── Provider / API 供应商
                                      │
                                      └── Provider Model / 模型供应实例
```

`owned_by` 表示模型研发方；`provider` 表示实际提供 API 的供应商。两者不能视为同一概念。

## 文档

- [数据模型与复刻分析](docs/data-model.md)
- [`GET /v1/models` 接口设计](docs/api-v1-models.md)
- [实现架构与界面设计](docs/implementation.md)
- [模型数据重新采集审计](docs/data-collection-audit.md)
- [官方模型数据维护规范](docs/official-data-maintenance.md)

## 当前状态

TypeScript 构建 + 纯静态发布：

- React + Vite 实现响应式模型目录，筛选与分页在浏览器内完成；
- `pnpm sync` 在构建时生成全部数据：公开接口 `/v1/models`、`/v1/providers/{provider}/models`、`/v1/meta`，以及网站使用的 `/data/*` 目录文件；
- 首批正式维护 OpenAI、Anthropic、Google 的 11 个模型与 11 个第一方 Provider Offering；
- 并行采集 `models.dev/catalog.json` 与 OpenRouter 公共 Models API，合并补充价格、模态、限制和支持参数；
- GitHub Actions 定时同步并部署到 Cloudflare Workers Static Assets；上游异常或数据骤减时不发布，线上保持上一版；
- 同一份 `dist/` 可直接用 Caddy / Docker 自托管（见 `deploy/`）。

架构细节见 [实现架构](docs/implementation.md)。

## 本地开发

需要 Node.js 22+ 与 pnpm 10+：

```bash
pnpm install
pnpm sync        # 生成数据到 public/；离线时用 pnpm sync:dev
pnpm dev         # http://127.0.0.1:5173
```

验证与预览：

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm preview     # wrangler dev，按 Cloudflare 规则（_headers/_redirects）预览 dist/
```

## 部署

**Cloudflare**：在 GitHub 仓库配置 Secrets `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`，可选 Variable `SITE_URL`（线上地址，用于数据骤减保护与无变化跳过部署）。在 `wrangler.jsonc` 中取消注释 `routes` 并填写已托管在 Cloudflare 的域名。推送到 `main` 即部署，之后每 6 小时自动同步。

**自托管**：

```bash
docker build -f deploy/Dockerfile -t modelinfo .
docker run -p 8080:80 modelinfo
```
