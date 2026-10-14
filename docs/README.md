# 文档索引

| 文档 | 内容 |
| --- | --- |
| [development.md](development.md) | 环境、命令、目录、代码边界、多语言、自查 |
| [spec-v1-models.md](spec-v1-models.md) | `/v1/models` 接口与数据文件规范 |
| [maintenance.md](maintenance.md) | 数据收录范围、数据约定、维护流程、官方来源检查 |
| [design.md](design.md) | 视觉设计、组件与响应式约定 |
| [deployment.md](deployment.md) | Cloudflare Workers Builds 部署、自定义域名、CI 检查 |
| [../.github/CONTRIBUTING.md](../.github/CONTRIBUTING.md) | 贡献指南（中英）：Issue、PR、数据更新流程 |

新增文档在此登记。

## SDK 调研与核查

- [models.dev 精确匹配](audits/sdk-models-dev-2026-10-13.json)
- [SDK 支持范围与来源](audits/sdk-support-2026-10-13.json)
- [全库官方文档抓取结果](audits/sdk-documents-2026-10-13.json)
- [逐模型 SDK 匹配与待核查项](audits/sdk-internet-scan-2026-10-13.json)

以上为 2026-10-13 调研快照，当前模型数据仍以 `data/models/*.json` 为准；更新方法见 [数据维护](maintenance.md#sdk-数据)。
