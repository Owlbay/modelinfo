# ModelInfo 数据模型

> 本文定义当前唯一的数据分层。公开响应规范见 [`api-v1-models.md`](api-v1-models.md)。

## 1. 为什么必须分两层

同一个模型有两类不能混合的事实：

1. **Canonical Model**：由模型研发方公布的身份、原生能力、模态、Token 上限与知识截止时间；
2. **Provider Model**：某个供应商实际开放的模型 ID、API 路径、参数、价格及限制覆盖。

`owned_by` 表示模型研发方，`provider` 表示实际 API 供应商。二者即使名称相同，也属于不同实体。

```text
Canonical Model
  id: gpt-5.4
  owned_by: openai
       │
       ├── Provider Model: openai / gpt-5.4
       ├── Provider Model: azure / deployment-name
       └── Provider Model: openrouter / openai/gpt-5.4
```

当前正式数据先维护三家第一方 Provider；未来新增 Azure、Vertex AI、AWS Bedrock、OpenRouter 时，只增加 Provider Model，不复制或篡改 Canonical Model。

## 2. Canonical Model

代码类型为 `CanonicalModel`，数据位于 `data/official/official-models.ts`。

```ts
interface CanonicalModel {
  schema_version: "1.0";
  id: string;
  object: "model";
  name: string;
  description: string | null;
  created: number | null;
  owned_by: string;
  status: "preview" | "active" | "deprecated";
  aliases: string[];
  supported_apis: ListedApiId[];
  modalities: { input: string[]; output: string[] };
  limits: {
    context: number | null;
    max_input: number | null;
    max_output: number | null;
  };
  capabilities: {
    reasoning: boolean | null;
    reasoning_efforts: string[];
    tool_call: boolean | null;
    structured_output: boolean | null;
    streaming: boolean | null;
    caching: boolean | null;
    batch: boolean | null;
  };
  knowledge_cutoff: string | null;
  sources: OfficialSource[];
}
```

规则：

- 只记录模型研发方官方资料明确公布的值；
- 官方没有单独声明最大输入时，`max_input=null`，不使用 `context-max_output` 推算；
- `reasoning=true` 不代表所有 Provider 使用同一个参数；
- Canonical Model 不存价格，因为价格是销售渠道属性；
- 每个事实必须由至少一个 `OfficialSource` 覆盖。

## 3. Provider Model

代码类型为 `ProviderModel`，数据位于 `data/official/provider-models.ts`。

```ts
interface ProviderModel {
  schema_version: "1.0";
  provider: string;
  canonical_id: string;
  model_id: string;
  api_base: string;
  supported_apis: Array<{
    id: ListedApiId;
    method: "GET" | "POST";
    endpoint: string;
  }>;
  overrides: {
    modalities?: Partial<CanonicalModel["modalities"]>;
    limits?: Partial<CanonicalModel["limits"]>;
    capabilities?: Partial<CanonicalModel["capabilities"]>;
  };
  price: OfficialTokenPrice | null;
  params: {
    model: string;
    max_output: string | null;
    reasoning: string | null;
    reasoning_values: string[];
    temperature: string | null;
    extra: Record<string, string | number | boolean | string[] | null>;
  };
  sources: OfficialSource[];
}
```

唯一键是 `(provider, model_id)`。`canonical_id` 必须引用已存在的 Canonical Model。

### 3.1 API

`supported_apis` 同时保存归一用途与真实路径：

```json
[
  {
    "id": "generate",
    "method": "POST",
    "endpoint": "/v1beta/models/{model}:generateContent"
  }
]
```

公开短名称包括 `messages`、`responses`、`generate`、`batch`、`realtime`、`completions`、`embeddings`、`images`、`video`、`audio`、`rerank`。

### 3.2 参数映射

参数使用点路径表达 Provider 请求结构，而不是声称三家兼容：

| 语义 | OpenAI | Anthropic | Google Gemini |
|---|---|---|---|
| 模型 | `model` | `model` | URL path `model` |
| 最大输出 | `max_output_tokens` | `max_tokens` | `generationConfig.maxOutputTokens` |
| 思考等级 | `reasoning.effort` | `output_config.effort` / `thinking` | `generationConfig.thinkingConfig.thinkingLevel` |
| 输入 | `input` / `messages` | `messages` | `contents` |

### 3.3 价格

```ts
interface OfficialTokenPrice {
  currency: "USD";
  unit: "million_tokens";
  input: number | null;
  output: number | null;
  cache_write: number | null;
  cache_read: number | null;
}
```

- 所有数值统一为 USD/百万 Token；
- 明确免费才可以写 `0`；
- 未公布或计费维度不适配时写 `null`；
- Cache Storage 这类 USD/百万 Token/小时的费用放在 `params.extra`，不能混入 Token 价格；
- Batch、长上下文、Priority、地区等价格以后应扩展为带条件的 `price_tiers`，不能覆盖基础标准价。

## 4. 来源模型

```ts
interface OfficialSource {
  id: string;
  title: string;
  url: string;
  retrieved_at: string;
  fields: string[];
}
```

`fields` 表示该官方页面支持哪些数据域，例如 `limits`、`supported_apis`、`params`、`pricing`。它不是一句“这个模型有来源”的笼统声明。

## 5. 合并生成 Model View

```text
无 provider:
  Canonical Model
  + 同 owned_by 第一方价格
  -> 公共模型视图（无 provider 字段）

有 provider:
  Canonical Model
  + Provider overrides
  + Provider endpoints / params / price
  -> Provider 模型视图（含 provider 字段）
```

合并顺序固定为 `Canonical <- Provider overrides`。Provider 未覆盖的字段继承 Canonical；Provider 明确覆盖的值优先。

## 6. 聚合发现数据的边界

网站发现目录（`/data/*` 静态文件）仍可使用 models.dev 与 OpenRouter，目的是发现更多 Provider 和候选模型。该数据：

- 可以用于 UI 搜索和待维护列表；
- 不会自动进入官方 `/v1/models`；
- 不能把第三方推断提升为模型研发方事实；
- 只有经过官方来源核验并写入两份正式数据文件后，才成为公开目录的一部分。
