# 开发

## 环境

- Node.js 22+，pnpm（版本见 `package.json` 的 `packageManager`）。
- 首次：`pnpm install`。

## 命令

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | 开发服务器，http://localhost:4321 |
| `pnpm check` | 类型检查（含数据 schema）+ 设计约束检查 |
| `pnpm build` | 构建到 `dist/`，含全部页面与 `/v1/models.json` |
| `pnpm preview` | 构建后用 wrangler 按 Cloudflare 规则本地预览（`_headers`、`_redirects` 生效），http://localhost:8787 |
| `pnpm deploy` | 构建并发布到 Cloudflare，见 [deployment.md](deployment.md) |
| `node scripts/validate-data.mjs [文件...]` | 只校验数据文件，适合批量编辑数据时快速自检 |

## 目录

```text
data/models/*.json        模型数据，唯一真源（规范见 spec-v1-models.md）
data/vendors/*.json       模型厂商登记：id、显示名、官网
src/content.config.ts     数据 schema，构建时校验，不合规即失败
src/lib/models.ts         取数、排序、发布字段裁剪 toPublic()、比较页紧凑记录 toCompare()、模型厂商显示名（读 data/vendors）、模型类型
src/lib/format.ts         纯格式化函数（Token、价格、费用），客户端脚本可直接引用；服务端经 models.ts 重新导出
src/lib/nav.ts            导航与快捷键
src/i18n/                 多语言：zh.ts（结构基准）、en.ts、index.ts（语言注册表）
src/pages/                路由：默认语言在根目录，其他语言在 [lang]/ 动态生成；v1/models.json.ts 生成接口
src/views/                页面实现（各语言共用）：Home、Models、Model、Compare、Docs、NotFound
src/components/           顶栏、页脚、字墙、搜索、分区、列表行、地址行、代码块、在线调试、语言菜单等
src/scripts/              客户端脚本：主题、快捷键、复制、比较选择（compare-store.ts，localStorage）
src/styles/               tokens.css（设计 token）、base、utilities、motion
public/                   _headers（CORS、缓存）、_redirects（/v1/models 重写）
scripts/                  check-design.mjs（设计约束）、validate-data.mjs（数据校验）
```

## 代码边界

- 页面只通过 `getModels()` 取数，不直接读 JSON。比较页在构建时嵌入 `toCompare()` 生成的紧凑 JSON（约 220KB，gzip 约 28KB），不在运行时请求 `/v1/models.json`（约 580KB，gzip 约 63KB）。
- 发布字段只在 `toPublic()` 裁剪；新增标准字段时同时改 schema、`toPublic()`、`scripts/validate-data.mjs` 与规范文档。
- 样式只引用 `tokens.css` 的变量，规则见 [design.md](design.md)；`pnpm check` 会拦截写死的字号、间距、颜色与圆角。
- 引入第三方源码前确认许可证，登记到根目录 `THIRD_PARTY_NOTICES.md`。

## 多语言

- 每种语言在构建时生成一套静态页：默认语言（中文）在 `/`，其他语言在 `/<code>/`。运行时不加载文案。
- 界面文案集中在 `src/i18n/`。`zh.ts` 是结构基准，其他语言用 `Dict` 类型约束，缺键或类型不符即编译失败。
- 模型数据（名称、简介等）不翻译。
- 语言下拉菜单列出 `LOCALES` 中的全部语言，选择会写入 `localStorage`；进入默认语言页面时按记录跳转。

新增一种语言（例如日语 `ja`）：

1. 复制 `src/i18n/en.ts` 为 `ja.ts`，翻译全部文案。
2. 在 `src/i18n/index.ts` 的 `LOCALES` 加 `{ code: 'ja', label: '日本語', htmlLang: 'ja' }`，在 `DICTS` 加 `ja`。
3. `pnpm check && pnpm build`，`/ja/` 下的页面会自动生成。

## 自查

改动 UI 后在 `pnpm preview` 中检查：桌面 1440、平板 768、手机 375 三种宽度，深浅两种主题，中英文各一遍。
