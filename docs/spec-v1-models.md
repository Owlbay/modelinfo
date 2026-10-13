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
      "api": { "types": ["messages", "batch"], "sdk": ["@ai-sdk/anthropic", "@anthropic-ai/sdk"] },
      "limits": { "context": 1000000, "input": 1000000, "output": 128000 },
      "modalities": { "input": ["text", "image", "document"], "output": ["text"] },
      "reasoning": { "supported": true, "efforts": ["low", "medium", "high", "xhigh", "max"] },
      "pricing": { "currency": "USD", "unit": "1M_tokens", "input": 5, "output": 25, "cache_read": 0.5, "cache_write": 6.25 },
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
| `owned_by` | string | 模型厂商，不是转售商或聚合网关 |
| `name` | string | 展示名称 |
| `api.types` | string[] | 接口类型：`chat`、`messages`、`responses`、`interactions`、`generate`、`batch`、`realtime`、`completions`、`embeddings`、`images`、`video`、`audio`、`3d`、`rerank`、`ocr`、`moderation` |
| `api.sdk` | string[] | SDK npm 包名数组（可含导出子路径），去重；可包含 AI SDK 适配器、厂商 SDK 和已核验的直接调用 SDK，如 `["@ai-sdk/anthropic", "@anthropic-ai/sdk"]`。至少支持一种模型接口；未知为 `[]`。调用时按协议选择 SDK 的方法并配置厂商地址、认证及参数；已下线型号只作历史接口参考 |
| `limits.context` | integer \| null | 输入与输出合计的上下文上限（Token） |
| `limits.input` | integer \| null | 官方单独声明的最大输入 |
| `limits.output` | integer \| null | 最大输出 |
| `modalities.input` / `output` | string[] | `text`、`image`、`audio`、`video`、`document`；输出另有 `embedding`（向量模型）、`score`（重排模型）、`3d`（3D 生成模型） |
| `reasoning.supported` | boolean \| null | 是否支持思考 |
| `reasoning.efforts` | string[] | 思考等级；空数组表示无等级档位（开关或 Token 预算控制）或未声明 |
| `pricing` | object \| null | 见第 6 节：币种、计价单位与价格；无公开报价为 `null` |
| `features` | string[] | 已确认支持：`tools`、`structured_output`、`streaming`、`caching`、`batch`；未列出即不支持或未确认 |
| `info.status` | string | `preview`（预览）、`active`（可用）、`deprecated`（厂商已宣布下线，仍可调用）、`retired`（已下线，不可调用；保留记录，不删除）。只需要可调用模型时，按此字段过滤掉 `retired` |
| `info.release_date` | string \| null | `YYYY-MM-DD`，与 `created` 一致 |
| `info.knowledge_cutoff` | string \| null | 训练知识截止时间 |
| `info.description` | string \| null | 官方简介 |
| `info.docs` | string \| null | 官方文档地址 |
| `info.verified_at` | string \| null | 最近人工核验日期 `YYYY-MM-DD` |

`chat` 指对话接口：OpenAI Chat Completions 格式（`/chat/completions`），厂商自有的对话格式（如 Cohere `/v2/chat`、Amazon Converse）也归此类，具体路径见 `providers[].endpoints`；`messages` 只指 Anthropic Messages 格式（`/v1/messages`），厂商官方提供 Anthropic 兼容端点时才标注；`generate` 指 Google `generateContent`；`responses` 指 OpenAI Responses 协议，`interactions` 指 Google Interactions 协议，两者不可混用。

## 6. 价格

```json
"pricing": { "currency": "USD", "unit": "1M_tokens", "input": 2, "output": 6, "cache_read": null, "cache_write": null }
```

- `currency`：ISO 4217 币种代码（`USD`、`CNY` 等），必填；
- `unit`：计价单位，必填：

| unit | 含义 | 典型模型 |
| --- | --- | --- |
| `1M_tokens` | 每百万 Token | 对话、向量、重排、按 Token 计费的音视频模型 |
| `1M_characters` | 每百万字符 | 语音合成（按字符计费） |
| `image` | 每张图片 | 图像生成 |
| `second` | 每秒 | 视频生成、按秒计费的语音 |
| `minute` / `hour` | 每分钟 / 每小时音频 | 语音识别 |
| `request` | 每次请求 | 按次计费（如固定时长的视频） |
| `page` | 每页 | OCR、文档解析 |

- `input` 为输入侧计价（如识别的音频时长、合成的文本字符），`output` 为输出侧计价（如生成的图片、视频秒数、输出 Token，含思考内容）；
- `cache_read` / `cache_write` 只用于 Token 计价；
- 取模型厂商第一方标准价，一个对象只对应一种币种、一个计价区域、一种计价单位；有多档时取最低一档的标准价；
- 无单独报价的项为 `null`；同一模型按多种单位混合计费且无法用一个单位表达时，`pricing` 为 `null`。

## 7. 数据文件

模型厂商登记在 `data/vendors/<id>.json`：`{ "id", "name", "url", "icon"? }`（`icon` 为 `@lobehub/icons-static-svg` 图标名，可选），`id` 即模型的 `owned_by`，`name` 为界面显示名。新模型厂商的模型需要先登记模型厂商。


`data/models/<id>.json` = 第 3 节的标准字段 + 维护字段（不发布）：

| 字段 | 说明 |
|---|---|
| `aliases` | 官方别名或快照 ID，用于搜索 |
| `translations` | 可选。介绍类文本的译文：`{ "<语言代码>": { "description": "…" } }`，语言代码取 `src/i18n` 的 `LOCALES`。只翻译 `info.description` 官方原文，页面按界面语言显示，缺省显示原文；`/v1/models` 始终返回原文 |
| `sources` | 官方来源（`api.sdk` 可使用 models.dev、SDK 作者文档与源码作为 SDK 支持来源） `{ title, url, retrieved_at }`，至少一条 HTTPS |
| `providers` | 调用方式：`id`、`model`、`base_url`、`endpoints`、`reasoning_param`，可选的按接口区分参数映射 `reasoning_params`（如 `{ "chat": "reasoning_effort", "responses": "reasoning.effort" }`），以及与标准字段不同时的覆盖值（`limits`、`modalities`、`features`、`pricing`、`reasoning_efforts`） |

校验规则在 `src/content.config.ts`，构建时执行，不合规即失败。

`providers[].base_url` 支持 `https://` 和 `wss://`；`endpoints` 的值为 `GET /path`、`POST /path` 或 `WS /path`。`WS` 只与 `wss://` 配对；HTTP 只与 `https://` 配对。不同协议地址拆分为不同 provider。公开接口仍不包含 providers。

`reasoning_param` 保留原有含义；多协议参数不同时，以 `reasoning_params[接口类型]` 为准，未确认的接口参数写 `null`。该映射只用于维护，不进入公开接口。

一致性校验：输入和输出的独立上限均不得超过已知总上下文；不要求两者最大值相加小于上下文（通常不能同时取最大值）。provider 端点类型必须在 `api.types` 中声明，思考参数映射必须对应已登记端点。官方来源自相矛盾时保留可确认值，冲突值写 `null`，不推算替代值。
