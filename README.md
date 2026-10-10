# ModelInfo

AI 模型目录：收录各研发方官方 API 上可调用的模型，统一整理上下文、输入输出、思考等级与价格，数据取自官方文档并逐项标注来源；同时以 OpenAI 兼容格式发布只读接口 `GET /v1/models`。

纯静态站点（Astro），构建约 1 秒，部署到 Cloudflare Workers Static Assets；界面支持中文与英文。

```bash
pnpm install
pnpm dev        # http://localhost:4321
pnpm check      # 类型 + 数据 schema + 设计约束
pnpm build      # 输出 dist/
```

文档：[开发](docs/development.md) · [接口规范](docs/spec-v1-models.md) · [数据维护](docs/maintenance.md) · [设计](docs/design.md) · [部署](docs/deployment.md)
