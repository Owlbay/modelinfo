# ModelInfo 开发约定

> 只写项目知识与约定；个人语言、工作偏好、模型参数放用户级配置（`~/.claude/CLAUDE.md`、`~/.codex/AGENTS.md`）。
> 每条规则都应能被检查或被违反；写不出反例的口号删掉。

## 产品不变量

1. `data/models/*.json` 是模型数据的唯一真源；页面与 `/v1/models` 都从这里生成，不另存副本。
2. 每个数值都能在该模型 `sources` 的官方页面找到；未知写 `null` 或空数组，不推算、不填 0。
3. `/v1/models` 前四个字段与 OpenAI Models API 一致，字段顺序固定；只增不改，见 `docs/spec-v1-models.md`。
4. `aliases`、`sources`、`providers` 是维护字段，不进入 `/v1/models`。
5. 纯静态输出，不引入服务端运行时、数据库或外部请求。

## 技术栈

- Astro 7 + TypeScript（strict），pnpm，静态输出到 `dist/`。
- 数据校验：Astro content collection + zod（`src/content.config.ts`），构建时执行。
- 多语言：构建时按 `src/i18n/` 的语言注册表生成多套静态页，默认语言在 `/`，其他语言在 `/<code>/`。
- 部署：Cloudflare Workers Static Assets（`wrangler.jsonc`），`_headers` / `_redirects` 在 `public/`。
- 字体：`@fontsource-variable/geist`、`@fontsource-variable/geist-mono`，本地打包。

## 代码边界

- 取数只在 `src/lib/models.ts`，格式化只在 `src/lib/format.ts`（由 models.ts 重新导出，客户端脚本可直接引用）；页面通过 `getModels()` 取数，不直接读 JSON。
- 发布字段的裁剪只在 `toPublic()`；新增标准字段时同时改 schema、`toPublic()`、`scripts/validate-data.mjs` 与规范文档。
- 界面文案只在 `src/i18n/`；`zh.ts` 是结构基准，其他语言由 `Dict` 类型约束。
- 导航与快捷键只在 `src/lib/nav.ts` 定义。
- 样式只引用 `src/styles/tokens.css` 的变量，规则见 `docs/design.md`。
- 引入第三方源码前先确认许可证，并登记到 `THIRD_PARTY_NOTICES.md`。

## 按需阅读与验证

- 文档索引：[docs/README.md](docs/README.md)（开发、接口规范、数据维护、设计、部署）。
- 检查命令：`pnpm check`（类型 + 数据 schema + 设计约束）、`pnpm build`；只改数据时可先跑 `node scripts/validate-data.mjs`。
- 改动 UI 后在 `pnpm preview` 中自查桌面 1440、平板 768、手机 375，深浅主题与各语言。
