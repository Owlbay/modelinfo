import type { OfficialSource, ProviderModel } from "../../src/catalog-types";

const verifiedAt = "2026-08-26T00:00:00.000Z";

const openAiCompare: OfficialSource = {
  id: "openai-model-compare",
  title: "Compare models | OpenAI API",
  url: "https://developers.openai.com/api/docs/models/compare",
  retrieved_at: verifiedAt,
  fields: ["supported_apis", "limits", "capabilities", "pricing"],
};

const openAiGpt54: OfficialSource = {
  id: "openai-gpt-5.4",
  title: "GPT-5.4 Model | OpenAI API",
  url: "https://developers.openai.com/api/docs/models/gpt-5.4",
  retrieved_at: verifiedAt,
  fields: ["model_id", "supported_apis", "limits", "params", "pricing"],
};

const openAiLatestModel: OfficialSource = {
  id: "openai-latest-model-guide",
  title: "Using GPT-5.6 | OpenAI API",
  url: "https://developers.openai.com/api/docs/guides/latest-model",
  retrieved_at: verifiedAt,
  fields: ["params", "cache_pricing"],
};

const anthropicModelsApi: OfficialSource = {
  id: "anthropic-models-api",
  title: "List Models | Claude API Reference",
  url: "https://platform.claude.com/docs/en/api/models/list",
  retrieved_at: verifiedAt,
  fields: ["model_id", "limits", "capabilities"],
};

const anthropicFable5: OfficialSource = {
  id: "anthropic-fable-5",
  title: "Claude Fable 5 | Claude Platform Docs",
  url: "https://platform.claude.com/docs/en/models/fable-5/overview",
  retrieved_at: verifiedAt,
  fields: ["model_id", "supported_apis", "limits", "params", "pricing"],
};

const anthropicSonnet5: OfficialSource = {
  id: "anthropic-sonnet-5",
  title: "Claude Sonnet 5 | Claude Platform Docs",
  url: "https://platform.claude.com/docs/en/models/sonnet-5/overview",
  retrieved_at: verifiedAt,
  fields: ["model_id", "supported_apis", "limits", "params", "pricing"],
};

const anthropicMessagesApi: OfficialSource = {
  id: "anthropic-messages-api",
  title: "Messages | Claude API Reference",
  url: "https://platform.claude.com/docs/en/api/messages",
  retrieved_at: verifiedAt,
  fields: ["supported_apis", "params"],
};

const anthropicBatchesApi: OfficialSource = {
  id: "anthropic-message-batches-api",
  title: "Batches | Claude API Reference",
  url: "https://platform.claude.com/docs/en/api/messages/batches",
  retrieved_at: verifiedAt,
  fields: ["supported_apis"],
};

const anthropicPricing: OfficialSource = {
  id: "anthropic-pricing",
  title: "Pricing | Claude Platform Docs",
  url: "https://platform.claude.com/docs/en/about-claude/pricing",
  retrieved_at: verifiedAt,
  fields: ["pricing", "cache_pricing"],
};

const geminiModelsApi: OfficialSource = {
  id: "gemini-models-api",
  title: "Models | Gemini API",
  url: "https://ai.google.dev/api/models",
  retrieved_at: verifiedAt,
  fields: ["model_id", "supported_apis", "limits", "params"],
};

const geminiGenerateApi: OfficialSource = {
  id: "gemini-generate-content-api",
  title: "Generating content | Gemini API",
  url: "https://ai.google.dev/api/generate-content",
  retrieved_at: verifiedAt,
  fields: ["supported_apis", "params"],
};

const geminiBatchApi: OfficialSource = {
  id: "gemini-batch-api",
  title: "Batch API | Gemini API",
  url: "https://ai.google.dev/gemini-api/docs/batch-api",
  retrieved_at: verifiedAt,
  fields: ["supported_apis", "batch_pricing"],
};

const geminiPricing: OfficialSource = {
  id: "gemini-pricing",
  title: "Pricing | Gemini API",
  url: "https://ai.google.dev/gemini-api/docs/pricing",
  retrieved_at: verifiedAt,
  fields: ["pricing", "cache_pricing"],
};

const openAiEndpoints: ProviderModel["supported_apis"] = [
  { id: "messages", method: "POST", endpoint: "/v1/chat/completions" },
  { id: "responses", method: "POST", endpoint: "/v1/responses" },
  { id: "batch", method: "POST", endpoint: "/v1/batches" },
];

const anthropicEndpoints: ProviderModel["supported_apis"] = [
  { id: "messages", method: "POST", endpoint: "/v1/messages" },
  { id: "batch", method: "POST", endpoint: "/v1/messages/batches" },
];

const geminiEndpoints: ProviderModel["supported_apis"] = [
  {
    id: "generate",
    method: "POST",
    endpoint: "/v1beta/models/{model}:generateContent",
  },
  {
    id: "batch",
    method: "POST",
    endpoint: "/v1beta/models/{model}:batchGenerateContent",
  },
];

const openAiParams = (reasoningValues: string[]): ProviderModel["params"] => ({
  model: "model",
  max_output: "max_output_tokens",
  reasoning: "reasoning.effort",
  reasoning_values: reasoningValues,
  temperature: "temperature",
  extra: {
    responses_input: "input",
    messages_input: "messages",
    stream: "stream",
  },
});

const anthropicParams = (reasoningValues: string[]): ProviderModel["params"] => ({
  model: "model",
  max_output: "max_tokens",
  reasoning: reasoningValues.length > 0 ? "output_config.effort" : "thinking",
  reasoning_values: reasoningValues,
  temperature: "temperature",
  extra: {
    input: "messages",
    system: "system",
    stream: "stream",
    thinking: "thinking",
  },
});

const geminiParams = (reasoningValues: string[]): ProviderModel["params"] => ({
  model: "path:model",
  max_output: "generationConfig.maxOutputTokens",
  reasoning: "generationConfig.thinkingConfig.thinkingLevel",
  reasoning_values: reasoningValues,
  temperature: "generationConfig.temperature",
  extra: {
    input: "contents",
    system: "systemInstruction",
    stream_endpoint: "/v1beta/models/{model}:streamGenerateContent",
  },
});

export const providerModels: ProviderModel[] = [
  {
    schema_version: "1.0",
    provider: "openai",
    canonical_id: "gpt-5.6-sol",
    model_id: "gpt-5.6-sol",
    api_base: "https://api.openai.com",
    supported_apis: openAiEndpoints,
    overrides: {},
    price: {
      currency: "USD",
      unit: "million_tokens",
      input: 4,
      output: 20,
      cache_write: 5,
      cache_read: 0.4,
    },
    params: openAiParams(["none", "low", "medium", "high", "xhigh", "max"]),
    sources: [openAiCompare, openAiLatestModel],
  },
  {
    schema_version: "1.0",
    provider: "openai",
    canonical_id: "gpt-5.6-terra",
    model_id: "gpt-5.6-terra",
    api_base: "https://api.openai.com",
    supported_apis: openAiEndpoints,
    overrides: {},
    price: {
      currency: "USD",
      unit: "million_tokens",
      input: 2,
      output: 12,
      cache_write: 2.5,
      cache_read: 0.2,
    },
    params: openAiParams(["none", "low", "medium", "high", "xhigh", "max"]),
    sources: [openAiCompare, openAiLatestModel],
  },
  {
    schema_version: "1.0",
    provider: "openai",
    canonical_id: "gpt-5.6-luna",
    model_id: "gpt-5.6-luna",
    api_base: "https://api.openai.com",
    supported_apis: openAiEndpoints,
    overrides: {},
    price: {
      currency: "USD",
      unit: "million_tokens",
      input: 0.2,
      output: 1.2,
      cache_write: 0.25,
      cache_read: 0.02,
    },
    params: openAiParams(["none", "low", "medium", "high", "xhigh", "max"]),
    sources: [openAiCompare, openAiLatestModel],
  },
  {
    schema_version: "1.0",
    provider: "openai",
    canonical_id: "gpt-5.4",
    model_id: "gpt-5.4",
    api_base: "https://api.openai.com",
    supported_apis: openAiEndpoints,
    overrides: {},
    price: {
      currency: "USD",
      unit: "million_tokens",
      input: 2.5,
      output: 15,
      cache_write: null,
      cache_read: 0.25,
    },
    params: openAiParams(["none", "low", "medium", "high", "xhigh"]),
    sources: [openAiGpt54],
  },
  {
    schema_version: "1.0",
    provider: "anthropic",
    canonical_id: "claude-fable-5",
    model_id: "claude-fable-5",
    api_base: "https://api.anthropic.com",
    supported_apis: anthropicEndpoints,
    overrides: {},
    price: {
      currency: "USD",
      unit: "million_tokens",
      input: 10,
      output: 50,
      cache_write: 12.5,
      cache_read: 1,
    },
    params: {
      ...anthropicParams(["low", "medium", "high", "xhigh", "max"]),
      temperature: null,
      extra: {
        ...anthropicParams(["low", "medium", "high", "xhigh", "max"]).extra,
        thinking_mode: "adaptive_always_on",
      },
    },
    sources: [anthropicFable5, anthropicMessagesApi, anthropicBatchesApi, anthropicPricing],
  },
  {
    schema_version: "1.0",
    provider: "anthropic",
    canonical_id: "claude-opus-5",
    model_id: "claude-opus-5",
    api_base: "https://api.anthropic.com",
    supported_apis: anthropicEndpoints,
    overrides: {},
    price: {
      currency: "USD",
      unit: "million_tokens",
      input: 5,
      output: 25,
      cache_write: 6.25,
      cache_read: 0.5,
    },
    params: anthropicParams(["low", "medium", "high", "xhigh", "max"]),
    sources: [anthropicModelsApi, anthropicMessagesApi, anthropicBatchesApi, anthropicPricing],
  },
  {
    schema_version: "1.0",
    provider: "anthropic",
    canonical_id: "claude-sonnet-5",
    model_id: "claude-sonnet-5",
    api_base: "https://api.anthropic.com",
    supported_apis: anthropicEndpoints,
    overrides: {},
    price: {
      currency: "USD",
      unit: "million_tokens",
      input: 2,
      output: 10,
      cache_write: 2.5,
      cache_read: 0.2,
    },
    params: {
      ...anthropicParams(["low", "medium", "high", "xhigh", "max"]),
      temperature: null,
      extra: {
        ...anthropicParams(["low", "medium", "high", "xhigh", "max"]).extra,
        thinking_mode: "adaptive",
        batch_max_output_beta: 300_000,
      },
    },
    sources: [anthropicSonnet5, anthropicMessagesApi, anthropicBatchesApi, anthropicPricing],
  },
  {
    schema_version: "1.0",
    provider: "anthropic",
    canonical_id: "claude-sonnet-4-6",
    model_id: "claude-sonnet-4-6",
    api_base: "https://api.anthropic.com",
    supported_apis: anthropicEndpoints,
    overrides: {},
    price: {
      currency: "USD",
      unit: "million_tokens",
      input: 3,
      output: 15,
      cache_write: 3.75,
      cache_read: 0.3,
    },
    params: anthropicParams([]),
    sources: [anthropicMessagesApi, anthropicBatchesApi, anthropicPricing],
  },
  {
    schema_version: "1.0",
    provider: "anthropic",
    canonical_id: "claude-haiku-4-5",
    model_id: "claude-haiku-4-5",
    api_base: "https://api.anthropic.com",
    supported_apis: anthropicEndpoints,
    overrides: {},
    price: {
      currency: "USD",
      unit: "million_tokens",
      input: 1,
      output: 5,
      cache_write: 1.25,
      cache_read: 0.1,
    },
    params: anthropicParams([]),
    sources: [anthropicMessagesApi, anthropicBatchesApi, anthropicPricing],
  },
  {
    schema_version: "1.0",
    provider: "google",
    canonical_id: "gemini-3.7-flash",
    model_id: "gemini-3.7-flash",
    api_base: "https://generativelanguage.googleapis.com",
    supported_apis: geminiEndpoints,
    overrides: {},
    price: {
      currency: "USD",
      unit: "million_tokens",
      input: 0.75,
      output: 3.75,
      cache_write: null,
      cache_read: 0.075,
    },
    params: {
      ...geminiParams(["low", "medium", "high"]),
      extra: {
        ...geminiParams(["low", "medium", "high"]).extra,
        cache_storage_per_million_token_hour: 0.5,
        pricing_valid_through: "2026-12-31",
      },
    },
    sources: [geminiModelsApi, geminiGenerateApi, geminiBatchApi, geminiPricing],
  },
  {
    schema_version: "1.0",
    provider: "google",
    canonical_id: "gemini-3.5-flash",
    model_id: "gemini-3.5-flash",
    api_base: "https://generativelanguage.googleapis.com",
    supported_apis: geminiEndpoints,
    overrides: {},
    price: {
      currency: "USD",
      unit: "million_tokens",
      input: 1.5,
      output: 9,
      cache_write: null,
      cache_read: 0.15,
    },
    params: {
      ...geminiParams([]),
      extra: {
        ...geminiParams([]).extra,
        cache_storage_per_million_token_hour: 1,
      },
    },
    sources: [geminiModelsApi, geminiGenerateApi, geminiBatchApi, geminiPricing],
  },
];
