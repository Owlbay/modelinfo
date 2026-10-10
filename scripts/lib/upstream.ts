import { createHash } from "node:crypto";
import type {
  ApiSurface,
  ApiSurfaceId,
  CatalogSourceStatus,
  ModelOffering,
  Modality,
  PriceRate,
  PriceTier,
  ReasoningControl,
} from "../../src/catalog-types";

interface RawReasoningOption {
  type: "toggle" | "effort" | "budget_tokens";
  values?: Array<string | null>;
  min?: number;
  max?: number;
}

interface RawCost {
  input: number;
  output: number;
  reasoning?: number;
  cache_read?: number;
  cache_write?: number;
  input_audio?: number;
  output_audio?: number;
  tiers?: Array<RawCost & { tier: { type?: "context"; size: number } }>;
  context_over_200k?: RawCost;
}

interface RawCanonicalModel {
  id: string;
  name: string;
  description: string;
  family?: string;
  attachment?: boolean;
  reasoning?: boolean;
  tool_call?: boolean;
  structured_output?: boolean;
  temperature?: boolean;
  knowledge?: string;
  release_date?: string;
  last_updated?: string;
  modalities?: { input: string[]; output: string[] };
  open_weights?: boolean;
  limit?: { context: number; input?: number; output?: number };
  license?: string;
  links?: Array<{ label?: string; url: string; type?: string }>;
  weights?: Array<{
    label?: string;
    url: string;
    format?: string;
    quantization?: string;
  }>;
  benchmarks?: Array<{
    name: string;
    score: number | string;
    metric?: string;
    harness?: string;
    variant?: string;
    dataset?: string;
    version?: string;
    source?: string;
    date?: string;
  }>;
}

interface RawProviderModel extends RawCanonicalModel {
  attachment: boolean;
  reasoning: boolean;
  reasoning_options?: RawReasoningOption[];
  tool_call: boolean;
  interleaved?: true | { field: "reasoning_content" | "reasoning_details" };
  release_date: string;
  last_updated: string;
  modalities: { input: string[]; output: string[] };
  open_weights: boolean;
  limit: { context: number; input?: number; output: number };
  status?: "alpha" | "beta" | "deprecated";
  cost?: RawCost;
  provider?: {
    npm?: string;
    api?: string;
    shape?: "responses" | "completions";
    body?: Record<string, unknown>;
    headers?: Record<string, string>;
  };
  experimental?: Record<string, unknown>;
}

interface RawProvider {
  id: string;
  env: string[];
  npm: string;
  api?: string;
  name: string;
  doc: string;
  models: Record<string, RawProviderModel>;
}

interface RawCatalog {
  models: Record<string, RawCanonicalModel>;
  providers: Record<string, RawProvider>;
}

interface RawOpenRouterModel {
  id: string;
  canonical_slug?: string;
  hugging_face_id?: string | null;
  name: string;
  created?: number;
  description?: string;
  context_length?: number | null;
  architecture?: {
    modality?: string;
    input_modalities?: string[];
    output_modalities?: string[];
    tokenizer?: string;
    instruct_type?: string | null;
  };
  pricing?: Record<string, string | Array<Record<string, unknown>>>;
  top_provider?: {
    context_length?: number | null;
    max_completion_tokens?: number | null;
    is_moderated?: boolean;
  };
  per_request_limits?: Record<string, number | string | null> | null;
  supported_parameters?: string[];
  default_parameters?: Record<string, unknown>;
  supported_voices?: string[];
  knowledge_cutoff?: string | null;
  expiration_date?: string | null;
  links?: Record<string, string>;
}

interface RawOpenRouterResponse {
  data: RawOpenRouterModel[];
}

export interface CatalogSnapshot {
  offerings: ModelOffering[];
  version: string;
  generatedAt: string;
  source: "aggregated" | "models.dev" | "fallback_sample";
  sources: CatalogSourceStatus[];
}

const CATALOG_URL = "https://models.dev/catalog.json";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/models?output_modalities=all";
const SOURCE_ID = "src_models_dev";
const OPENROUTER_SOURCE_ID = "src_openrouter";

const effortRanks: Record<string, number> = {
  none: 0,
  minimal: 5,
  low: 10,
  medium: 20,
  high: 30,
  xhigh: 40,
  max: 50,
  default: 60,
};

function fallbackCatalog(): RawCatalog {
  const gpt: RawProviderModel = {
    id: "gpt-5.4",
    name: "GPT-5.4",
    description: "Agent-ready GPT for coding and computer-use workflows",
    family: "gpt",
    attachment: true,
    reasoning: true,
    reasoning_options: [
      { type: "effort", values: ["none", "low", "medium", "high", "xhigh"] },
    ],
    tool_call: true,
    structured_output: true,
    temperature: false,
    knowledge: "2025-08-31",
    release_date: "2026-03-05",
    last_updated: "2026-03-05",
    modalities: { input: ["text", "image", "pdf"], output: ["text"] },
    open_weights: false,
    limit: { context: 1_050_000, input: 922_000, output: 128_000 },
    cost: { input: 2.5, output: 15, cache_read: 0.25 },
    provider: { shape: "responses" },
  };
  const claude: RawProviderModel = {
    id: "claude-sonnet-4-6",
    name: "Claude Sonnet 4.6",
    description: "Balanced Claude model for reasoning and agent workflows",
    family: "claude",
    attachment: true,
    reasoning: true,
    reasoning_options: [{ type: "budget_tokens", min: 1024, max: 64_000 }],
    tool_call: true,
    structured_output: true,
    temperature: true,
    release_date: "2026-02-17",
    last_updated: "2026-02-17",
    modalities: { input: ["text", "image", "pdf"], output: ["text"] },
    open_weights: false,
    limit: { context: 200_000, output: 64_000 },
    cost: { input: 3, output: 15, cache_read: 0.3, cache_write: 3.75 },
  };

  return {
    models: {
      "openai/gpt-5.4": {
        ...gpt,
        id: "openai/gpt-5.4",
      },
      "anthropic/claude-sonnet-4-6": {
        ...claude,
        id: "anthropic/claude-sonnet-4-6",
      },
    },
    providers: {
      openai: {
        id: "openai",
        name: "OpenAI",
        env: ["OPENAI_API_KEY"],
        npm: "@ai-sdk/openai",
        doc: "https://platform.openai.com/docs/models",
        models: { "gpt-5.4": gpt },
      },
      anthropic: {
        id: "anthropic",
        name: "Anthropic",
        env: ["ANTHROPIC_API_KEY"],
        npm: "@ai-sdk/anthropic",
        doc: "https://docs.anthropic.com/en/docs/about-claude/models",
        models: { "claude-sonnet-4-6": claude },
      },
    },
  };
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function canonicalIndex(models: Record<string, RawCanonicalModel>) {
  const byName = new Map<string, string[]>();
  for (const [id, model] of Object.entries(models)) {
    const key = `${normalizeName(model.name)}:${model.family ?? ""}`;
    byName.set(key, [...(byName.get(key) ?? []), id]);
  }
  return byName;
}

function resolveCanonicalId(
  providerId: string,
  modelId: string,
  model: RawProviderModel,
  models: Record<string, RawCanonicalModel>,
  byName: Map<string, string[]>,
) {
  for (const candidate of [modelId, `${providerId}/${modelId}`]) {
    if (models[candidate]) return { id: candidate, confidence: "reported" as const };
  }

  const nameMatches = byName.get(`${normalizeName(model.name)}:${model.family ?? ""}`) ?? [];
  if (nameMatches.length === 1) {
    return { id: nameMatches[0]!, confidence: "inferred" as const };
  }

  return { id: null, confidence: "unknown" as const };
}

function modality(value: string): Modality {
  if (value === "pdf") {
    return {
      type: "document",
      mime_types: ["application/pdf"],
      sources: [],
      constraints: {},
    };
  }
  return { type: value, mime_types: [], sources: [], constraints: {} };
}

function createdTimestamp(releaseDate?: string) {
  if (!releaseDate || !/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) return null;
  const timestamp = Date.parse(`${releaseDate}T00:00:00Z`);
  return Number.isFinite(timestamp) ? Math.floor(timestamp / 1000) : null;
}

function reasoningControls(options?: RawReasoningOption[]): ReasoningControl[] {
  return (options ?? []).map((option) => {
    if (option.type === "toggle") return { type: "toggle", default: null };
    if (option.type === "budget_tokens") {
      return {
        type: "budget_tokens",
        min: option.min ?? null,
        max: option.max ?? null,
        step: null,
        default: null,
      };
    }
    return {
      type: "effort",
      values: (option.values ?? []).map((value) => ({
        id: value,
        provider_value: value,
        rank: value === null ? null : (effortRanks[value] ?? null),
      })),
      default: null,
    };
  });
}

function apiSurfaces(provider: RawProvider, model: RawProviderModel) {
  const surfaces: Partial<Record<ApiSurfaceId, ApiSurface>> = {};
  const add = (id: ApiSurfaceId, protocol: string, confidence: ApiSurface["confidence"]) => {
    surfaces[id] = { status: "supported", protocol, confidence };
  };

  if (model.provider?.shape === "responses") {
    add("responses", "openai-responses", "reported");
  } else if (model.provider?.shape === "completions") {
    add("chat_completions", "openai-chat-completions", "reported");
  } else if (provider.npm === "@ai-sdk/anthropic") {
    add("messages", "anthropic-messages", "inferred");
  } else if (provider.npm.includes("google")) {
    add("generate_content", "google-generate-content", "inferred");
  } else if (provider.npm.includes("openai")) {
    add("chat_completions", "openai-chat-completions", "inferred");
  }

  return surfaces;
}

const costMetrics: Array<[keyof RawCost, string]> = [
  ["input", "input_text_tokens"],
  ["output", "output_text_tokens"],
  ["reasoning", "reasoning_tokens"],
  ["cache_read", "cached_input_tokens"],
  ["cache_write", "cache_write_tokens"],
  ["input_audio", "input_audio_tokens"],
  ["output_audio", "output_audio_tokens"],
];

function rates(cost?: RawCost): PriceRate[] {
  if (!cost) return [];
  return costMetrics.flatMap(([key, metric]) => {
    const amount = cost[key];
    if (typeof amount !== "number") return [];
    return [
      {
        metric,
        unit: { quantity: 1_000_000, name: "token" as const },
        amount: amount.toFixed(6),
      },
    ];
  });
}

function priceTiers(cost?: RawCost): PriceTier[] {
  if (!cost) return [];
  const tiers = [...(cost.tiers ?? [])];
  if (tiers.length === 0 && cost.context_over_200k) {
    tiers.push({
      ...cost.context_over_200k,
      tier: { type: "context", size: 200_000 },
    });
  }
  return tiers.map((tier) => ({
    when: {
      dimension: "context_tokens",
      operator: "gt",
      value: tier.tier.size,
    },
    rates: rates(tier),
  }));
}

const openRouterPriceMetrics: Record<
  string,
  { metric: string; name: PriceRate["unit"]["name"]; multiplier: number }
> = {
  prompt: { metric: "input_text_tokens", name: "token", multiplier: 1_000_000 },
  completion: { metric: "output_text_tokens", name: "token", multiplier: 1_000_000 },
  internal_reasoning: { metric: "reasoning_tokens", name: "token", multiplier: 1_000_000 },
  input_cache_read: { metric: "cached_input_tokens", name: "token", multiplier: 1_000_000 },
  input_cache_write: { metric: "cache_write_tokens", name: "token", multiplier: 1_000_000 },
  input_cache_write_1h: {
    metric: "cache_write_1h_tokens",
    name: "token",
    multiplier: 1_000_000,
  },
  image_token: { metric: "input_image_tokens", name: "token", multiplier: 1_000_000 },
  image_output: { metric: "output_image_tokens", name: "token", multiplier: 1_000_000 },
  image: { metric: "input_image_tokens", name: "token", multiplier: 1_000_000 },
  audio: { metric: "input_audio_tokens", name: "token", multiplier: 1_000_000 },
  input_audio_cache: {
    metric: "cached_input_audio_tokens",
    name: "token",
    multiplier: 1_000_000,
  },
  audio_output: { metric: "output_audio_tokens", name: "token", multiplier: 1_000_000 },
  web_search: { metric: "web_search_requests", name: "request", multiplier: 1 },
};

function openRouterRates(pricing?: RawOpenRouterModel["pricing"]): PriceRate[] {
  if (!pricing) return [];
  return Object.entries(pricing).flatMap(([key, rawAmount]) => {
    const definition = openRouterPriceMetrics[key];
    if (!definition || typeof rawAmount !== "string") return [];
    const numeric = Number(rawAmount);
    if (!Number.isFinite(numeric)) return [];
    return [
      {
        metric: definition.metric,
        unit: { quantity: definition.multiplier, name: definition.name },
        amount: (numeric * definition.multiplier).toFixed(9).replace(/0+$/, "").replace(/\.$/, ""),
      },
    ];
  });
}

function openRouterSummary(pricing?: RawOpenRouterModel["pricing"]) {
  const perMillion = (key: string) => {
    const value = pricing?.[key];
    if (typeof value !== "string") return null;
    const amount = Number(value) * 1_000_000;
    return Number.isFinite(amount) ? amount : null;
  };
  return {
    input: perMillion("prompt"),
    output: perMillion("completion"),
    reasoning: perMillion("internal_reasoning"),
    cache_read: perMillion("input_cache_read"),
    cache_write: perMillion("input_cache_write"),
  };
}

function openRouterTiers(pricing?: RawOpenRouterModel["pricing"]): PriceTier[] {
  const overrides = pricing?.overrides;
  if (!Array.isArray(overrides)) return [];
  return overrides.flatMap((override) => {
    const threshold = override.min_prompt_tokens;
    if (typeof threshold !== "number" || !Number.isFinite(threshold)) return [];
    const overridePricing = Object.fromEntries(
      Object.entries(override).filter(([, value]) => typeof value === "string"),
    ) as RawOpenRouterModel["pricing"];
    return [
      {
        when: { dimension: "context_tokens", operator: "gte", value: threshold },
        rates: openRouterRates(overridePricing),
      },
    ];
  });
}

function openRouterModality(value: string): Modality {
  if (value === "file") {
    return { type: "document", mime_types: [], sources: [], constraints: {} };
  }
  return modality(value);
}

function openRouterApiSurfaces(model: RawOpenRouterModel) {
  const outputs = new Set(model.architecture?.output_modalities ?? []);
  const surfaces: Partial<Record<ApiSurfaceId, ApiSurface>> = {};
  const add = (id: ApiSurfaceId, protocol: string) => {
    surfaces[id] = { status: "supported", protocol, confidence: "reported" };
  };
  if (outputs.has("embeddings")) add("embeddings", "openai-embeddings");
  if (outputs.has("image")) add("images", "openrouter-images");
  if (outputs.has("video")) add("video", "openrouter-video");
  if (outputs.has("rerank")) add("rerank", "openrouter-rerank");
  if (outputs.has("audio") || outputs.has("speech") || outputs.has("transcription")) {
    add("audio", "openrouter-audio");
  }
  if (outputs.has("text") || Object.keys(surfaces).length === 0) {
    add("chat_completions", "openai-chat-completions");
  }
  return surfaces;
}

function openRouterOffering(model: RawOpenRouterModel, retrievedAt: string): ModelOffering {
  const parameters = new Set(model.supported_parameters ?? []);
  const reasoning =
    parameters.has("reasoning") ||
    parameters.has("reasoning_effort") ||
    parameters.has("include_reasoning");
  const input = (model.architecture?.input_modalities ?? ["text"]).map(openRouterModality);
  const output = (model.architecture?.output_modalities ?? ["text"]).map(openRouterModality);
  const hasTextOutput = output.some((item) => item.type === "text");
  const surfaces = openRouterApiSurfaces(model);
  const priceRates = openRouterRates(model.pricing);
  const owner = model.id.includes("/") ? model.id.split("/")[0]! : "unknown";
  const rawContext = model.top_provider?.context_length ?? model.context_length ?? null;
  const rawMaxOutput = model.top_provider?.max_completion_tokens ?? null;
  const context = rawContext && rawContext > 0 ? rawContext : null;
  const maxOutput = rawMaxOutput && rawMaxOutput > 0 ? rawMaxOutput : null;
  const priceSummary = openRouterSummary(model.pricing);
  if (!hasTextOutput) {
    priceSummary.input = null;
    priceSummary.output = null;
  }

  return {
    schema_version: "1.0",
    id: model.id,
    offering_id: `openrouter/${model.id}`,
    object: "model",
    created: model.created ?? null,
    owned_by: owner,
    name: model.name,
    description: model.description ?? null,
    family: null,
    canonical_id: model.canonical_slug ?? model.id,
    aliases: [],
    supported_apis: Object.keys(surfaces) as ApiSurfaceId[],
    api_surfaces: surfaces,
    provider: {
      id: "openrouter",
      name: "OpenRouter",
      model_id: model.id,
      api_base: "https://openrouter.ai/api/v1",
      sdk: "@openrouter/sdk",
      docs_url: "https://openrouter.ai/docs/guides/overview/models",
      logo_url: "https://models.dev/logos/openrouter.svg",
      auth: { env: ["OPENROUTER_API_KEY"] },
    },
    capabilities: {
      attachment: input.some((item) => item.type !== "text"),
      tool_call: parameters.has("tools"),
      structured_output: parameters.has("structured_outputs") || parameters.has("response_format"),
      temperature: parameters.has("temperature"),
      open_weights: model.hugging_face_id ? true : null,
      reasoning: {
        supported: reasoning,
        selection: "one_of",
        controls: reasoning
          ? parameters.has("reasoning_effort")
            ? [{ type: "effort", values: [], default: null }]
            : [{ type: "toggle", default: null }]
          : [],
        output: {
          mode: parameters.has("include_reasoning") ? "visible" : reasoning ? "hidden" : "unknown",
          field: parameters.has("include_reasoning") ? "reasoning" : null,
        },
      },
    },
    modalities: { input, output },
    limits: {
      tokens: {
        unit: "token",
        context_window: context,
        max_input: context !== null && maxOutput !== null ? Math.max(0, context - maxOutput) : null,
        max_output: maxOutput,
        tokenizer: model.architecture?.tokenizer ?? null,
        constraint: "input_plus_output_lte_context",
      },
    },
    pricing: priceRates.length
      ? {
          currency: "USD",
          effective_from: null,
          effective_to: model.expiration_date ?? null,
          rates: priceRates,
          tiers: openRouterTiers(model.pricing),
          summary: priceSummary,
        }
      : null,
    lifecycle: {
      status: "active",
      knowledge_cutoff: model.knowledge_cutoff ?? null,
      release_date: null,
      last_updated: null,
      deprecated_at: model.expiration_date ?? null,
    },
    license: null,
    links: Object.entries(model.links ?? {}).map(([label, url]) => ({
      label,
      url: url.startsWith("http") ? url : `https://openrouter.ai${url}`,
      type: "provider_metadata",
    })),
    weights: model.hugging_face_id
      ? [
          {
            label: "Hugging Face",
            url: `https://huggingface.co/${model.hugging_face_id}`,
            format: null,
            quantization: null,
          },
        ]
      : [],
    benchmarks: [],
    provenance: {
      confidence: "reported",
      verified_at: retrievedAt,
      sources: [
        {
          id: OPENROUTER_SOURCE_ID,
          type: "provider_catalog",
          url: OPENROUTER_URL,
          retrieved_at: retrievedAt,
        },
      ],
      fields: {
        limits: [OPENROUTER_SOURCE_ID],
        modalities: [OPENROUTER_SOURCE_ID],
        pricing: [OPENROUTER_SOURCE_ID],
        api_surfaces: [OPENROUTER_SOURCE_ID],
        capabilities: [OPENROUTER_SOURCE_ID],
      },
    },
    extensions: {
      openrouter: {
        canonical_slug: model.canonical_slug ?? null,
        hugging_face_id: model.hugging_face_id ?? null,
        architecture: model.architecture ?? null,
        supported_parameters: model.supported_parameters ?? [],
        default_parameters: model.default_parameters ?? null,
        supported_voices: model.supported_voices ?? [],
        per_request_limits: model.per_request_limits ?? null,
        top_provider: model.top_provider ?? null,
        pricing_overrides: model.pricing?.overrides ?? null,
      },
    },
  };
}

function mergeOpenRouter(
  offerings: ModelOffering[],
  models: RawOpenRouterModel[],
  retrievedAt: string,
) {
  const byId = new Map(offerings.map((offering) => [offering.offering_id, offering]));
  let added = 0;
  let enriched = 0;

  for (const rawModel of models) {
    const direct = openRouterOffering(rawModel, retrievedAt);
    const current = byId.get(direct.offering_id);
    if (!current) {
      byId.set(direct.offering_id, direct);
      added += 1;
      continue;
    }

    current.name = direct.name;
    current.description = direct.description ?? current.description;
    current.created = current.created ?? direct.created;
    current.canonical_id = direct.canonical_id ?? current.canonical_id;
    current.supported_apis = direct.supported_apis;
    current.api_surfaces = direct.api_surfaces;
    current.modalities = direct.modalities;
    current.limits.tokens.context_window = direct.limits.tokens.context_window ?? current.limits.tokens.context_window;
    current.limits.tokens.max_input = direct.limits.tokens.max_input ?? current.limits.tokens.max_input;
    current.limits.tokens.max_output = direct.limits.tokens.max_output ?? current.limits.tokens.max_output;
    current.limits.tokens.tokenizer = direct.limits.tokens.tokenizer ?? current.limits.tokens.tokenizer;
    current.pricing = direct.pricing ?? current.pricing;
    current.capabilities.attachment = direct.capabilities.attachment;
    current.capabilities.tool_call = direct.capabilities.tool_call;
    current.capabilities.structured_output = direct.capabilities.structured_output;
    current.capabilities.temperature = direct.capabilities.temperature;
    current.capabilities.open_weights = direct.capabilities.open_weights ?? current.capabilities.open_weights;
    if (direct.capabilities.reasoning.supported) {
      current.capabilities.reasoning.supported = true;
      if (current.capabilities.reasoning.controls.length === 0) {
        current.capabilities.reasoning.controls = direct.capabilities.reasoning.controls;
      }
    }
    current.lifecycle.knowledge_cutoff =
      direct.lifecycle.knowledge_cutoff ?? current.lifecycle.knowledge_cutoff;
    current.lifecycle.deprecated_at = direct.lifecycle.deprecated_at ?? current.lifecycle.deprecated_at;
    current.provenance.sources = [
      ...current.provenance.sources.filter((source) => source.id !== OPENROUTER_SOURCE_ID),
      ...direct.provenance.sources,
    ];
    for (const [field, sourceIds] of Object.entries(direct.provenance.fields)) {
      current.provenance.fields[field] = [
        ...new Set([...(current.provenance.fields[field] ?? []), ...sourceIds]),
      ];
    }
    current.extensions.openrouter = direct.extensions.openrouter;
    enriched += 1;
  }

  return { offerings: [...byId.values()], added, enriched };
}

function normalizeOffering(
  provider: RawProvider,
  modelId: string,
  model: RawProviderModel,
  models: Record<string, RawCanonicalModel>,
  byName: Map<string, string[]>,
  retrievedAt: string,
): ModelOffering {
  const resolved = resolveCanonicalId(provider.id, modelId, model, models, byName);
  const canonical = resolved.id ? models[resolved.id] : undefined;
  const owner =
    resolved.id?.split("/")[0] ??
    (modelId.includes("/") ? modelId.split("/")[0] : provider.id);
  const surfaces = apiSurfaces(provider, model);
  const interleaved = model.interleaved;

  return {
    schema_version: "1.0",
    id: modelId,
    offering_id: `${provider.id}/${modelId}`,
    object: "model",
    created: createdTimestamp(model.release_date),
    owned_by: owner,
    name: model.name,
    description: model.description ?? canonical?.description ?? null,
    family: model.family ?? canonical?.family ?? null,
    canonical_id: resolved.id,
    aliases: [],
    supported_apis: Object.keys(surfaces) as ApiSurfaceId[],
    api_surfaces: surfaces,
    provider: {
      id: provider.id,
      name: provider.name,
      model_id: modelId,
      api_base: model.provider?.api ?? provider.api ?? null,
      sdk: model.provider?.npm ?? provider.npm ?? null,
      docs_url: provider.doc ?? null,
      logo_url: `https://models.dev/logos/${encodeURIComponent(provider.id)}.svg`,
      auth: { env: provider.env },
    },
    capabilities: {
      attachment: model.attachment ?? null,
      tool_call: model.tool_call ?? null,
      structured_output: model.structured_output ?? null,
      temperature: model.temperature ?? null,
      open_weights: model.open_weights ?? null,
      reasoning: {
        supported: model.reasoning ?? null,
        selection: "one_of",
        controls: reasoningControls(model.reasoning_options),
        output: {
          mode: interleaved ? "interleaved" : model.reasoning ? "hidden" : "unknown",
          field: typeof interleaved === "object" ? interleaved.field : null,
        },
      },
    },
    modalities: {
      input: model.modalities.input.map(modality),
      output: model.modalities.output.map(modality),
    },
    limits: {
      tokens: {
        unit: "token",
        context_window: model.limit.context ?? null,
        max_input: model.limit.input ?? null,
        max_output: model.limit.output ?? null,
        tokenizer: null,
        constraint: "input_plus_output_lte_context",
      },
    },
    pricing: model.cost
      ? {
          currency: "USD",
          effective_from: null,
          effective_to: null,
          rates: rates(model.cost),
          tiers: priceTiers(model.cost),
          summary: {
            input: model.cost.input ?? null,
            output: model.cost.output ?? null,
            reasoning: model.cost.reasoning ?? null,
            cache_read: model.cost.cache_read ?? null,
            cache_write: model.cost.cache_write ?? null,
          },
        }
      : null,
    lifecycle: {
      status: model.status ?? "active",
      knowledge_cutoff: model.knowledge ?? null,
      release_date: model.release_date ?? null,
      last_updated: model.last_updated ?? null,
      deprecated_at: null,
    },
    license: canonical?.license ?? null,
    links: (canonical?.links ?? []).map((link) => ({
      label: link.label ?? null,
      url: link.url,
      type: link.type ?? null,
    })),
    weights: (canonical?.weights ?? []).map((weight) => ({
      label: weight.label ?? null,
      url: weight.url,
      format: weight.format ?? null,
      quantization: weight.quantization ?? null,
    })),
    benchmarks: (canonical?.benchmarks ?? []).map((benchmark) => ({
      name: benchmark.name,
      score: benchmark.score,
      metric: benchmark.metric ?? null,
      harness: benchmark.harness ?? null,
      variant: benchmark.variant ?? null,
      dataset: benchmark.dataset ?? null,
      version: benchmark.version ?? null,
      source: benchmark.source ?? null,
      date: benchmark.date ?? null,
    })),
    provenance: {
      confidence: resolved.confidence,
      verified_at: retrievedAt,
      sources: [
        {
          id: SOURCE_ID,
          type: "catalog",
          url: CATALOG_URL,
          retrieved_at: retrievedAt,
        },
        {
          id: `src_provider_${provider.id}`,
          type: "provider_docs",
          url: provider.doc,
          retrieved_at: retrievedAt,
        },
      ],
      fields: {
        limits: [SOURCE_ID],
        modalities: [SOURCE_ID],
        pricing: [SOURCE_ID],
        reasoning: [SOURCE_ID],
      },
    },
    extensions: {
      "models.dev": {
        experimental: model.experimental ?? null,
        provider_request: model.provider
          ? {
              shape: model.provider.shape ?? null,
              body: model.provider.body ?? {},
              headers: model.provider.headers ?? {},
            }
          : null,
      },
    },
  };
}

function normalizeCatalog(catalog: RawCatalog, retrievedAt: string) {
  const byName = canonicalIndex(catalog.models);
  return Object.values(catalog.providers).flatMap((provider) =>
    Object.entries(provider.models).map(([modelId, model]) =>
      normalizeOffering(provider, modelId, model, catalog.models, byName, retrievedAt),
    ),
  );
}

/** 内容版本：忽略采集时间戳，只有数据本身变化时才变化。 */
export function contentVersion(value: unknown) {
  const body = JSON.stringify(value, (key, item) =>
    key === "retrieved_at" || key === "verified_at" ? undefined : item,
  );
  return createHash("sha256").update(body).digest("hex").slice(0, 16);
}

async function fetchJson<T>(url: string, label: string): Promise<T> {
  const response = await fetch(url, {
    headers: { "User-Agent": "ModelInfo/0.3" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`${label} returned ${response.status}`);
  return (await response.json()) as T;
}

export interface UpstreamOptions {
  /** 允许上游失败时降级（仅本地开发使用）：models.dev 失败用内置样例，OpenRouter 失败则跳过。 */
  lenient: boolean;
}

/**
 * 一次性采集并合并 models.dev 与 OpenRouter。
 * 默认严格模式：任一上游失败直接抛错，CI 因此失败，线上保持上一次部署的数据。
 */
export async function buildUpstreamCatalog(options: UpstreamOptions): Promise<CatalogSnapshot> {
  const [modelsDevResult, openRouterResult] = await Promise.allSettled([
    fetchJson<RawCatalog>(CATALOG_URL, "models.dev"),
    fetchJson<RawOpenRouterResponse>(OPENROUTER_URL, "OpenRouter"),
  ]);

  if (!options.lenient) {
    const failures = [modelsDevResult, openRouterResult]
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) => String(result.reason));
    if (failures.length) throw new Error(`Upstream unavailable: ${failures.join("; ")}`);
  }

  const retrievedAt = new Date().toISOString();
  const usingFallback = modelsDevResult.status === "rejected";
  if (usingFallback) console.warn("Using fallback sample catalog:", modelsDevResult.reason);
  let offerings = normalizeCatalog(
    usingFallback ? fallbackCatalog() : modelsDevResult.value,
    retrievedAt,
  );
  const sources: CatalogSourceStatus[] = [
    {
      id: usingFallback ? "fallback_sample" : "models.dev",
      name: usingFallback ? "内置离线样例" : "models.dev",
      url: usingFallback ? "local://fallback-sample" : CATALOG_URL,
      status: usingFallback ? "fallback" : "fresh",
      retrieved_at: retrievedAt,
      records: offerings.length,
      added: offerings.length,
      enriched: 0,
    },
  ];

  let source: CatalogSnapshot["source"] = usingFallback ? "fallback_sample" : "models.dev";
  if (openRouterResult.status === "fulfilled") {
    const merged = mergeOpenRouter(offerings, openRouterResult.value.data, retrievedAt);
    offerings = merged.offerings;
    source = "aggregated";
    sources.push({
      id: "openrouter",
      name: "OpenRouter",
      url: OPENROUTER_URL,
      status: "fresh",
      retrieved_at: retrievedAt,
      records: openRouterResult.value.data.length,
      added: merged.added,
      enriched: merged.enriched,
    });
  } else {
    console.warn("OpenRouter enrichment unavailable:", openRouterResult.reason);
    sources.push({
      id: "openrouter",
      name: "OpenRouter",
      url: OPENROUTER_URL,
      status: "unavailable",
      retrieved_at: null,
      records: 0,
      added: 0,
      enriched: 0,
    });
  }

  offerings.sort((left, right) => {
    const byUpdated = (right.lifecycle.last_updated ?? "").localeCompare(
      left.lifecycle.last_updated ?? "",
    );
    return (
      byUpdated ||
      left.name.localeCompare(right.name) ||
      left.offering_id.localeCompare(right.offering_id)
    );
  });

  return {
    offerings,
    version: contentVersion(offerings),
    generatedAt: retrievedAt,
    source,
    sources,
  };
}
