# `GET /v1/models` 正式规范

本文件是 ModelInfo `/v1/models` 的唯一公开规范。接口以静态 JSON 发布，按路径区分两层语义：

- `/v1/models`：返回模型研发方公开的 Canonical Model 通用能力；
- `/v1/providers/{provider}/models`：返回该 Provider 实际提供的模型 ID、接口、参数、限制覆盖和价格。

所有文件由 CI 在构建时生成，不支持查询参数筛选与分页；客户端获取全量列表后自行过滤（官方目录体量很小）。

`models.dev` 与 OpenRouter 数据不进入此接口，只用于网站的内部发现目录。

## 1. 默认：通用模型视图

```http
GET /v1/models HTTP/1.1
Accept: application/json
```

```json
{
  "object": "list",
  "data": [
    {
      "id": "gpt-5.4",
      "object": "model",
      "name": "GPT-5.4",
      "created": 1772668800,
      "owned_by": "openai",
      "status": "active",
      "supported_apis": ["messages", "responses", "batch"],
      "context": 1050000,
      "max_input": null,
      "max_output": 128000,
      "input": ["text", "image"],
      "output": ["text"],
      "capabilities": {
        "reasoning": true,
        "reasoning_efforts": ["none", "low", "medium", "high", "xhigh"],
        "tool_call": true,
        "structured_output": true,
        "streaming": true,
        "caching": true,
        "batch": true
      },
      "price": {
        "currency": "USD",
        "unit": "million_tokens",
        "input": 2.5,
        "output": 15,
        "cache_write": null,
        "cache_read": 0.25
      }
    }
  ]
}
```

默认视图不会出现 `provider` 字段。`price` 取模型研发方自己的第一方 Provider 标准价；它仍属于 Provider Offering 数据，不会写入 Canonical Model 源记录。

## 2. Provider 视图

```http
GET /v1/providers/anthropic/models HTTP/1.1
Accept: application/json
```

```json
{
  "object": "list",
  "data": [
    {
      "id": "claude-opus-5",
      "object": "model",
      "name": "Claude Opus 5",
      "created": 1784851200,
      "owned_by": "anthropic",
      "status": "active",
      "supported_apis": ["messages", "batch"],
      "context": 1000000,
      "max_input": 1000000,
      "max_output": 128000,
      "input": ["text", "image", "document"],
      "output": ["text"],
      "capabilities": {
        "reasoning": true,
        "reasoning_efforts": ["low", "medium", "high", "xhigh", "max"],
        "tool_call": true,
        "structured_output": true,
        "streaming": true,
        "caching": true,
        "batch": true
      },
      "price": {
        "currency": "USD",
        "unit": "million_tokens",
        "input": 5,
        "output": 25,
        "cache_write": 6.25,
        "cache_read": 0.5
      },
      "provider": {
        "id": "anthropic",
        "canonical_id": "claude-opus-5",
        "model_id": "claude-opus-5",
        "api_base": "https://api.anthropic.com",
        "endpoints": {
          "messages": "POST /v1/messages",
          "batch": "POST /v1/messages/batches"
        },
        "params": {
          "model": "model",
          "max_output": "max_tokens",
          "reasoning": "output_config.effort",
          "reasoning_values": ["low", "medium", "high", "xhigh", "max"],
          "temperature": "temperature",
          "extra": {
            "input": "messages",
            "system": "system",
            "stream": "stream",
            "thinking": "thinking"
          }
        }
      }
    }
  ]
}
```

Provider 视图先读取 Canonical Model，再应用 Provider 的 `modalities`、`limits` 与 `capabilities` 覆盖。`id` 是 Provider 请求时使用的 `model_id`，`provider.canonical_id` 用于回到模型本体。

## 3. 字段定义

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 默认视图为 Canonical ID；Provider 视图为实际请求 ID |
| `owned_by` | string | 模型研发方，不是转售商或聚合网关 |
| `supported_apis` | string[] | 官方明确支持且已归一化的接口类型 |
| `context` | integer/null | 输入与输出合计的上下文上限 |
| `max_input` | integer/null | 官方单独声明的输入上限；未声明为 `null` |
| `max_output` | integer/null | 最大输出 Token 数 |
| `input`、`output` | string[] | 输入和输出模态 |
| `capabilities` | object | 推理等级、工具、结构化输出、流式、缓存和 Batch 能力 |
| `price` | object/null | 当前 Provider 的公开标准 Token 价 |
| `provider` | object | 仅带 `provider` 查询时出现的调用细节 |

未知值始终为 `null` 或空数组，绝不使用 `0`、`false` 或推测值代替未知事实。

## 4. API 短名称

| 公开值 | 典型 Provider 接口 |
|---|---|
| `messages` | OpenAI Chat Completions 或 Anthropic Messages |
| `responses` | OpenAI Responses |
| `generate` | Google `generateContent` |
| `batch` | Provider 的异步 Batch 接口 |
| `realtime` | 实时双向接口 |
| `completions` | 旧式文本补全 |
| `embeddings` | 向量嵌入 |
| `images`、`video`、`audio` | 媒体生成或处理 |
| `rerank` | 重排 |

短名称表达用途，不假设各 Provider 请求体兼容。准确路径必须读取 Provider 视图的 `provider.endpoints`。

## 5. 价格

所有 Token 价格均为 `USD / 1,000,000 tokens`：

- `input`：未命中缓存的输入；
- `output`：模型输出；
- `cache_write`：创建或写入缓存；
- `cache_read`：读取已命中缓存。

Provider 没有单独的 Cache Write Token 价格时返回 `null`，不能把 Cache Storage 费用写入 `cache_write`。Google 的按时间缓存存储费保存在 Provider `params.extra`，因为其计量单位不同。

## 6. 路径

| 路径 | 说明 |
|---|---|
| `/v1/models`（= `/v1/models.json`） | Canonical 视图 |
| `/v1/providers/{provider}/models`（= `.json`） | Provider 视图，`provider` 为 `openai`、`anthropic` 或 `google` |
| `/v1/meta`、`/v1/health`（= `/v1/meta.json`） | 数据版本、生成时间、来源与网站目录文件索引 |

无扩展名路径通过 `_redirects`（自托管时为 Caddy `rewrite`）内部重写到 `.json` 文件。未知 Provider 返回 `404`。查询参数会被忽略：`/v1/models?provider=openai` 返回的仍是 Canonical 视图。

## 7. 缓存

```http
Access-Control-Allow-Origin: *
Cache-Control: public, max-age=300, stale-while-revalidate=3600
ETag: "..."
```

ETag 由托管平台根据文件内容生成，客户端可使用 `If-None-Match` 获得 `304 Not Modified`。数据版本见 `/v1/meta` 的 `official.version`。

## 8. 兼容规则

- Provider、端点和参数属于可选 Provider 层，不改变 Canonical 字段语义；
- 新能力可以增加枚举值，客户端必须容忍未知值；
- 删除字段或改变现有含义需要新的 API 大版本；
- 字段来源和验证时间保存在 `/v1/meta`，不重复放入每个列表项。
