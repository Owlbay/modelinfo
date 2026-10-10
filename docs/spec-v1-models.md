# `/v1/models` 接口规范

ModelInfo 唯一的公开接口。构建时由 `data/models/*.json` 生成静态文件，不依赖服务端运行时。

## 1. 原则

- **兼容 OpenAI**：外层 `{ "object": "list", "data": [...] }`；每条记录前四个字段 `id`、`object`、`created`、`owned_by` 与 OpenAI Models API 一致。
- **分组不平铺**：其余信息按用途归入固定分组，字段顺序固定。
- **未知即 `null`**：未知值写 `null` 或空数组，不用 `0`、`false` 或推测值代替。
- **只增不改**：可以新增字段与枚举值；删除字段或改变含义需要新的大版本。

## 2. 访问

```http
GET /v1/models
```

也可访问 `/v1/models.json`。响应头：`Access-Control-Allow-Origin: *`，`Cache-Control: public, max-age=300, stale-while-revalidate=3600`，ETag 由托管平台生成。查询参数会被忽略。

## 3. 结构

```text
id · object · created · owned_by   OpenAI 标准字段
name                               展示名称
api          ① API 格式
limits       ② 上下文与输入 / 输出上限
modalities   ③ 输入 / 输出类型
reasoning    ④ 思考
pricing      ⑤ 价格
features     附加能力
info         ⑥ 源信息
```

## 4. 示例

```json
{
  "object": "list",
  "data": [
    {
      "id": "claude-opus-5",
      "object": "model",
      "created": 1784851200,
      "owned_by": "anthropic",
      "name": "Claude Opus 5",
      "api": { "types": ["messages", "batch"] },
      "limits": { "context": 1000000, "input": 1000000, "output": 128000 },
      "modalities": { "input": ["text", "image", "document"], "output": ["text"] },
      "reasoning": { "supported": true, "efforts": ["low", "medium", "high", "xhigh", "max"] },
      "pricing": { "currency": "USD", "input": 5, "output": 25, "cache_read": 0.5, "cache_write": 6.25 },
      "features": ["tools", "structured_output", "streaming", "caching", "batch"],
      "info": {
        "status": "active",
        "release_date": "2026-07-24",
        "knowledge_cutoff": "2026-05",
        "description": "Anthropic model for deep reasoning and long-horizon agentic work.",
        "docs": "https://platform.claude.com/docs/en/api/models/list",
        "verified_at": "2026-08-26"
      }
    }
  ]
}
```

## 5. 字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 模型 ID |
| `object` | `"model"` | 固定值 |
| `created` | integer \| null | 发布时间，Unix 秒 |
| `owned_by` | string | 模型研发方，不是转售商或聚合网关 |
| `name` | string | 展示名称 |
| `api.types` | string[] | 接口类型：`messages`、`responses`、`generate`、`batch`、`realtime`、`completions`、`embeddings`、`images`、`video`、`audio`、`rerank`、`ocr`、`moderation` |
| `limits.context` | integer \| null | 输入与输出合计的上下文上限（Token） |
| `limits.input` | integer \| null | 官方单独声明的最大输入 |
| `limits.output` | integer \| null | 最大输出 |
| `modalities.input` / `output` | string[] | `text`、`image`、`audio`、`video`、`document`；输出另有 `embedding`（向量模型）、`score`（重排模型） |
| `reasoning.supported` | boolean \| null | 是否支持思考 |
| `reasoning.efforts` | string[] | 思考等级；空数组表示无等级档位（开关或 Token 预算控制）或未声明 |
| `pricing` | object \| null | 见第 6 节；无公开报价为 `null` |
| `features` | string[] | 已确认支持：`tools`、`structured_output`、`streaming`、`caching`、`batch`；未列出即不支持或未确认 |
| `info.status` | string | `preview`、`active`、`deprecated` |
| `info.release_date` | string \| null | `YYYY-MM-DD`，与 `created` 一致 |
| `info.knowledge_cutoff` | string \| null | 训练知识截止时间 |
| `info.description` | string \| null | 官方简介 |
| `info.docs` | string \| null | 官方文档地址 |
| `info.verified_at` | string \| null | 最近人工核验日期 `YYYY-MM-DD` |

`messages` 指 OpenAI Chat Completions 或 Anthropic Messages，`generate` 指 Google `generateContent`；类型表达用途，不代表请求体互相兼容。

## 6. 价格

```json
"pricing": { "currency": "USD", "input": 2, "output": 6, "cache_read": null, "cache_write": null }
```

- `currency`：ISO 4217 币种代码（`USD`、`CNY` 等），必填；
- 单位固定为**每百万 Token**；`output` 含思考内容；
- `cache_read` 为缓存命中，`cache_write` 为创建或写入缓存；
- 取研发方第一方 Provider 的标准价，一个对象只对应一种币种与一个计价区域；
- 无单独报价的项为 `null`；按时间计费的缓存存储等非 Token 费用不写入。

## 7. 数据文件

研发方登记在 `data/vendors/<id>.json`：`{ "id", "name", "url" }`，`id` 即模型的 `owned_by`，`name` 为界面显示名。新研发方的模型需要先登记研发方。


`data/models/<id>.json` = 第 3 节的标准字段 + 三个维护字段（不发布）：

| 字段 | 说明 |
|---|---|
| `aliases` | 官方别名或快照 ID，用于搜索 |
| `sources` | 官方来源 `{ title, url, retrieved_at }`，至少一条 HTTPS |
| `providers` | 调用方式：`id`、`model`、`base_url`、`endpoints`、`reasoning_param`，以及与标准字段不同时的覆盖值（`limits`、`modalities`、`features`、`pricing`、`reasoning_efforts`） |

校验规则在 `src/content.config.ts`，构建时执行，不合规即失败。
