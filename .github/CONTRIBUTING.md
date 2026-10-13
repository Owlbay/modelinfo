# 贡献指南 / Contributing

[中文](#中文) · [English](#english)

## 中文

ModelInfo 的模型数据全部在 `data/models/*.json`，一个模型一个文件。发现数值错误、模型过时或缺少模型时，欢迎提交 Issue 或直接提交 PR。

### 提交 Issue

- **数据更正**：说明模型 ID、字段、当前值、正确值，并附上能看到该数值的官方页面。
- **新增模型**：说明模型厂商、模型 ID、类型，并附上官方模型页或价格页。
- **问题反馈 / 功能建议**：按模板填写。

### 提交 PR 更新数据

1. Fork 仓库并新建分支，例如 `data/gpt-5.4-pricing`。
2. 修改或新建 `data/models/<id>.json`，文件名与 `id` 一致；新模型厂商先新建 `data/vendors/<owned_by>.json`（`id`、`name`、`url`）。字段与顺序见 [接口规范](../docs/spec-v1-models.md)，收录范围与数据约定见 [数据维护](../docs/maintenance.md)。
3. 规则：
   - 只用模型厂商官方文档、模型页、价格页与官方公告，并写进该文件的 `sources`。
   - 官方没有给出的值写 `null` 或空数组，不推算、不填 0。
   - 更新 `sources[].retrieved_at` 与 `info.verified_at` 为核验当天日期。
4. 本地检查：
   ```bash
   pnpm install
   node scripts/validate-data.mjs data/models/<id>.json
   node scripts/check-official.mjs data/models/<id>.json
   pnpm check && pnpm build
   ```
5. 提交 PR 并按模板填写来源与检查项。CI 会运行完整校验与构建，合并到 `main` 后自动部署。

提交信息建议使用中文简述，例如 `数据：更新 gpt-5.4 价格`。

### 改动代码或界面

先阅读 [开发文档](../docs/development.md) 与 [设计约定](../docs/design.md)。界面文案放在 `src/i18n/`，中文与英文需同时更新。

## English

All model data lives in `data/models/*.json`, one file per model. Issues and pull requests are welcome when a value is wrong, a model is outdated, or a model is missing.

### Opening an issue

- **Data correction**: give the model ID, field, current value, correct value, and the official page where the value is shown.
- **New model**: give the vendor, model ID and type, with the official model or pricing page.
- **Bug report / Feature request**: follow the template.

### Updating data with a pull request

1. Fork the repository and create a branch, e.g. `data/gpt-5.4-pricing`.
2. Edit or add `data/models/<id>.json`; the file name must match `id`. For a new vendor, first add `data/vendors/<owned_by>.json` (`id`, `name`, `url`). Field order is defined in the [API spec](../docs/spec-v1-models.md); scope and conventions are in [data maintenance](../docs/maintenance.md) (Chinese).
3. Rules:
   - Use only official vendor docs, model pages, pricing pages and announcements, and list them in the file's `sources`.
   - Values the vendor does not publish are `null` or an empty array — never estimated, never 0.
   - Set `sources[].retrieved_at` and `info.verified_at` to the date you checked.
4. Check locally:
   ```bash
   pnpm install
   node scripts/validate-data.mjs data/models/<id>.json
   node scripts/check-official.mjs data/models/<id>.json
   pnpm check && pnpm build
   ```
5. Open the PR and fill in sources and the checklist. CI runs full validation and a build; merges to `main` deploy automatically.

### Changing code or UI

Read the [development guide](../docs/development.md) and [design conventions](../docs/design.md). UI copy lives in `src/i18n/`; update Chinese and English together.
