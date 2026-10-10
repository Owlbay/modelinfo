# 官方模型数据维护规范

验证日期：2026-08-26

## 1. 当前覆盖

正式目录当前维护：

| 模型研发方 / 第一方 Provider | Canonical Model | Provider Model |
|---|---:|---:|
| OpenAI | 4 | 4 |
| Anthropic | 5 | 5 |
| Google Gemini API | 2 | 2 |
| 合计 | 11 | 11 |

这 11 条是已经逐字段对照官方资料的首批正式数据，包括 Anthropic 当前四个主力型号以及需求中指定的 Claude Sonnet 4.6；不声称等于三家厂商的全部历史、媒体或专用模型。models.dev/OpenRouter 的数千条聚合记录是候选发现池，不属于正式覆盖数量。

## 2. 官方来源优先级

同一字段有多个来源时按以下顺序处理：

1. 官方 Models API 返回值；
2. 官方单模型 API Reference；
3. 官方模型总览、能力和价格文档；
4. 官方发布公告；
5. 第三方目录只用于发现，不作为正式字段证据。

出现冲突时不做平均或猜测：保留较具体、较新的官方来源，并在变更记录说明被替换的值。

## 3. 当前来源

### OpenAI

- Models：`https://developers.openai.com/api/docs/models`
- Model compare：`https://developers.openai.com/api/docs/models/compare`
- GPT-5.4：`https://developers.openai.com/api/docs/models/gpt-5.4`
- Latest model guide：`https://developers.openai.com/api/docs/guides/latest-model`

### Anthropic

- Models API：`https://platform.claude.com/docs/en/api/models/list`
- Models overview：`https://platform.claude.com/docs/en/about-claude/models/overview`
- Claude Fable 5：`https://platform.claude.com/docs/en/models/fable-5/overview`
- Claude Sonnet 5：`https://platform.claude.com/docs/en/models/sonnet-5/overview`
- Messages API：`https://platform.claude.com/docs/en/api/messages`
- Message Batches API：`https://platform.claude.com/docs/en/api/messages/batches`
- Pricing：`https://platform.claude.com/docs/en/about-claude/pricing`

### Google

- Models API：`https://ai.google.dev/api/models`
- Generate Content：`https://ai.google.dev/api/generate-content`
- Gemini 3.7 Flash：`https://ai.google.dev/gemini-api/docs/models/gemini-3.7-flash`
- Gemini 3.5 Flash：`https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash`
- Batch API：`https://ai.google.dev/gemini-api/docs/batch-api`
- Pricing：`https://ai.google.dev/gemini-api/docs/pricing`

## 4. 新增或更新模型的检查清单

### Canonical Model

- [ ] 官方模型 ID、展示名、研发方；
- [ ] 创建/发布日期；官网未给出则为 `null`；
- [ ] 输入与输出模态；
- [ ] Context、最大输入、最大输出分别核对；
- [ ] Messages/Responses/Generate/Batch 等模型能力；
- [ ] Reasoning 是否支持及官方思考等级；
- [ ] Tool Calling、Structured Output、Streaming、Caching；
- [ ] 知识截止时间；
- [ ] 每个数据域关联 `OfficialSource.fields`；
- [ ] 更新 `retrieved_at`。

### Provider Model

- [ ] Provider 实际请求使用的 `model_id`；
- [ ] `api_base`；
- [ ] 每种用途的 HTTP Method 与 Endpoint；
- [ ] 模型、输入、最大输出、推理、Temperature 参数路径；
- [ ] Provider 对上下文、模态和能力的覆盖；
- [ ] 标准 Input/Output/Cache Write/Cache Read 价格；
- [ ] Batch、长上下文、Priority、地区、缓存存储等条件价格；
- [ ] Provider 官方来源。

## 5. 更新频率

- 每周：检查模型列表、弃用状态和新模型；
- 每月：逐条复核价格、Token 上限和 API 能力；
- 官方发布/价格公告后 24 小时内：执行专项更新；
- 每次变更：运行 TypeScript 校验、生产构建和四组接口测试。

建议后续 CI 把 `retrieved_at` 超过 30 天的记录标为待复核，但不要自动删除或自动覆盖正式数据。

## 6. 验证命令

```bash
pnpm typecheck
pnpm test
pnpm sync
pnpm build
pnpm preview   # wrangler dev，默认 http://127.0.0.1:8787
curl -sS 'http://127.0.0.1:8787/v1/models'
curl -sS 'http://127.0.0.1:8787/v1/providers/openai/models'
curl -sS 'http://127.0.0.1:8787/v1/providers/anthropic/models'
curl -sS 'http://127.0.0.1:8787/v1/providers/google/models'
```

同步脚本导入官方数据时执行的 `validateOfficialCatalog()` 负责结构一致性；人工检查负责确认官网事实没有变化。两者缺一不可。

## 7. 外部边界

`BLOCKED / EXTERNAL`：Anthropic 和 Google 的实时 Models API 需要调用方 API Key。本次未获授权读取任何本地密钥，也没有用用户凭据发请求。当前数据来自无需认证即可访问的官方 API Reference 和模型/价格页面。

如果以后接入带凭据的定期扫描：

- 只从运行环境读取 Key，不进入仓库和日志；
- 扫描结果先生成差异报告，不直接覆盖正式数据；
- 人工审核通过后再更新两份正式数据文件；
- 记录 API 响应时间、来源版本和字段差异。
