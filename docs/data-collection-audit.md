# 模型数据重新采集审计

采集时间：2026-08-25（Asia/Shanghai）

## 1. 为什么原数据看起来不完整

原实现只读取 `https://models.dev/catalog.json`。它覆盖的 Provider 很多，但存在三个边界：

1. 上游同步有时间差；
2. `supported_apis` 在缺少请求 shape 时只能根据 SDK 推断；
3. OpenRouter 自己报告的支持参数、Tokenizer、请求限制和完整价格项没有进入 ModelInfo。

因此问题不是简单的“模型总条数少”，而是某些 Provider 的最新模型和字段完整度不足。

## 2. 本次实时对比

| 来源 | Provider 数 | Offering / Model 数 | OpenRouter 模型数 |
|---|---:|---:|---:|
| models.dev Catalog | 200 | 7,291 | 356 |
| OpenRouter 公共 Models API | 1 | 558 | 558 |
| ModelInfo 合并后 | 200 | 7,493 | 558 |

本次对比中：

- OpenRouter 有 202 个模型尚未出现在 models.dev 的 OpenRouter Provider 数据中；
- 356 个重叠 Offering 使用 OpenRouter 直接数据补充；
- 合并后总 Offering 从 7,291 增加到 7,493。

目录是实时变化的，以上数字是本次聚合采集快照，不应写死为长期产品承诺。它只服务于网站发现目录（`/data/*` 静态文件）。

## 3. 新增覆盖字段

OpenRouter 直接来源增加了：

- `canonical_slug` 与 Hugging Face ID；
- 输入和输出模态，包括 video、embeddings、transcription、speech、rerank；
- `context_length` 和 `max_completion_tokens`；
- `supported_parameters`；
- Tool Calling、Structured Output、Temperature 和 Reasoning 支持；
- Cache、Reasoning、Audio、Image、Web Search 等价格；
- 默认参数、支持声音、请求限制和价格覆盖规则。

## 4. 与正式目录的关系

从 2026-08-26 起，`/v1/models` 不再从本聚合快照生成。正式接口只读取经过官网逐字段核验的 Canonical Model 与 Provider Model；`/v1/health` 返回正式目录的模型、Provider 和官方来源数量。

聚合数据发现的新模型必须按 [`official-data-maintenance.md`](official-data-maintenance.md) 的检查清单核验后，才能进入正式数据文件。

## 5. 尚未声称完整的部分

- OpenAI、Anthropic、Google 等官方模型列表接口通常需要 API Key；本项目没有伪造授权或把营销页面当作机器可验证 API；
- models.dev 与 OpenRouter 都不能证明某个用户账户或区域一定可调用某个模型；
- OpenRouter 模型创建时间表示它进入 OpenRouter 目录的时间，不一定是模型首次发布日期；
- 图片、视频、音频等非文本价格仍可能需要查询具体 Endpoint；
- Open-weight 模型的许可证需要模型卡或官方仓库进一步核验。

## 6. 来源

- models.dev：`https://models.dev/catalog.json`
- OpenRouter：`https://openrouter.ai/api/v1/models?output_modalities=all`
- OpenRouter Models API 说明：`https://openrouter.ai/docs/guides/overview/models`
