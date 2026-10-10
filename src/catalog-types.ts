export type Confidence = "verified" | "reported" | "inferred" | "unknown";

export type ApiSurfaceId =
  | "responses"
  | "messages"
  | "chat_completions"
  | "completions"
  | "generate_content"
  | "embeddings"
  | "images"
  | "video"
  | "audio"
  | "rerank";

export type ListedApiId =
  | "messages"
  | "responses"
  | "completions"
  | "generate"
  | "batch"
  | "realtime"
  | "embeddings"
  | "images"
  | "video"
  | "audio"
  | "rerank";

export interface ApiSurface {
  status: "supported" | "unsupported" | "unknown";
  protocol: string;
  confidence: Confidence;
}

export interface Modality {
  type: "text" | "image" | "audio" | "video" | "document" | string;
  mime_types: string[];
  sources: Array<"url" | "base64" | "file_id" | string>;
  constraints: Record<string, number | string | boolean | null>;
}

export interface ReasoningEffortValue {
  id: string | null;
  provider_value: string | null;
  rank: number | null;
}

export type ReasoningControl =
  | { type: "toggle"; default: boolean | null }
  | {
      type: "effort";
      values: ReasoningEffortValue[];
      default: string | null;
    }
  | {
      type: "budget_tokens";
      min: number | null;
      max: number | null;
      step: number | null;
      default: number | null;
    };

export interface ReasoningCapability {
  supported: boolean | null;
  selection: "one_of";
  controls: ReasoningControl[];
  output: {
    mode: "hidden" | "summary" | "visible" | "interleaved" | "unknown";
    field: string | null;
  };
}

export interface PriceRate {
  metric: string;
  unit: {
    quantity: number;
    name: "token" | "request" | "image" | "second" | string;
  };
  amount: string;
}

export interface PriceTier {
  when: {
    dimension: string;
    operator: "gt" | "gte" | "lt" | "lte";
    value: number;
  };
  rates: PriceRate[];
}

export interface ModelOffering {
  schema_version: "1.0";
  id: string;
  offering_id: string;
  object: "model";
  created: number | null;
  owned_by: string;
  name: string;
  description: string | null;
  family: string | null;
  canonical_id: string | null;
  aliases: string[];
  supported_apis: ApiSurfaceId[];
  api_surfaces: Partial<Record<ApiSurfaceId, ApiSurface>>;
  provider: {
    id: string;
    name: string;
    model_id: string;
    api_base: string | null;
    sdk: string | null;
    docs_url: string | null;
    logo_url: string;
    auth: { env: string[] };
  };
  capabilities: {
    attachment: boolean | null;
    tool_call: boolean | null;
    structured_output: boolean | null;
    temperature: boolean | null;
    open_weights: boolean | null;
    reasoning: ReasoningCapability;
  };
  modalities: {
    input: Modality[];
    output: Modality[];
  };
  limits: {
    tokens: {
      unit: "token";
      context_window: number | null;
      max_input: number | null;
      max_output: number | null;
      tokenizer: string | null;
      constraint: "input_plus_output_lte_context";
    };
  };
  pricing: {
    currency: "USD";
    effective_from: string | null;
    effective_to: string | null;
    rates: PriceRate[];
    tiers: PriceTier[];
    summary: {
      input: number | null;
      output: number | null;
      reasoning: number | null;
      cache_read: number | null;
      cache_write: number | null;
    };
  } | null;
  lifecycle: {
    status: "alpha" | "beta" | "active" | "deprecated";
    knowledge_cutoff: string | null;
    release_date: string | null;
    last_updated: string | null;
    deprecated_at: string | null;
  };
  license: string | null;
  links: Array<{
    label: string | null;
    url: string;
    type: string | null;
  }>;
  weights: Array<{
    label: string | null;
    url: string;
    format: string | null;
    quantization: string | null;
  }>;
  benchmarks: Array<{
    name: string;
    score: number | string;
    metric: string | null;
    harness: string | null;
    variant: string | null;
    dataset: string | null;
    version: string | null;
    source: string | null;
    date: string | null;
  }>;
  provenance: {
    confidence: Confidence;
    verified_at: string;
    sources: Array<{
      id: string;
      type: "catalog" | "provider_docs" | "model_metadata" | string;
      url: string;
      retrieved_at: string;
    }>;
    fields: Record<string, string[]>;
  };
  extensions: Record<string, unknown>;
}

export interface OfficialSource {
  id: string;
  title: string;
  url: string;
  retrieved_at: string;
  fields: string[];
}

export interface OfficialTokenPrice {
  currency: "USD";
  unit: "million_tokens";
  input: number | null;
  output: number | null;
  cache_write: number | null;
  cache_read: number | null;
}

export interface CanonicalModel {
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
  modalities: {
    input: string[];
    output: string[];
  };
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

export interface ProviderModel {
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

export interface ModelView {
  id: string;
  object: "model";
  name: string;
  created: number | null;
  owned_by: string;
  status: "preview" | "active" | "deprecated";
  supported_apis: ListedApiId[];
  context: number | null;
  max_input: number | null;
  max_output: number | null;
  input: string[];
  output: string[];
  capabilities: CanonicalModel["capabilities"];
  price: OfficialTokenPrice | null;
  provider?: {
    id: string;
    canonical_id: string;
    model_id: string;
    api_base: string;
    endpoints: Partial<Record<ListedApiId, string>>;
    params: ProviderModel["params"];
  };
}

export interface ProviderFacet {
  id: string;
  name: string;
  count: number;
}

export interface CatalogSourceStatus {
  id: "models.dev" | "openrouter" | "fallback_sample" | string;
  name: string;
  url: string;
  status: "fresh" | "stale" | "unavailable" | "fallback";
  retrieved_at: string | null;
  records: number;
  added: number;
  enriched: number;
}

export interface CatalogFacets {
  providers: ProviderFacet[];
  input_modalities: Array<{ id: string; count: number }>;
  supported_apis: Array<{ id: string; count: number }>;
}

export interface ModelListResponse {
  object: "list";
  data: ModelView[];
}

/** 网站列表使用的精简记录，由同步脚本从 ModelOffering 生成；offering_id = `${provider}/${id}`。 */
export interface CatalogIndexRow {
  id: string;
  provider: string;
  name: string;
  owned_by: string;
  family: string | null;
  canonical_id: string | null;
  status: ModelOffering["lifecycle"]["status"];
  released: string | null;
  updated: string | null;
  context: number | null;
  max_output: number | null;
  price: { input: number | null; output: number | null } | null;
  input: string[];
  output: string[];
  apis: ApiSurfaceId[];
  reasoning: boolean | null;
  reasoning_efforts: string[];
  reasoning_budget: [number | null, number | null] | null;
  tool_call: boolean | null;
  structured_output: boolean | null;
  open_weights: boolean | null;
  /** 数据来源：models.dev / openrouter */
  sources: string[];
}

export interface CatalogIndexFile {
  object: "catalog_index";
  version: string;
  generated_at: string;
  providers: Record<string, { name: string; docs_url: string | null }>;
  data: CatalogIndexRow[];
}

/** /v1/meta.json：站点入口元数据，短缓存；其余数据文件按版本号命名并长期缓存。 */
export interface SiteMeta {
  object: "meta";
  status: "ok";
  generated_at: string;
  official: {
    version: string;
    models: number;
    offerings: number;
    providers: string[];
    sources: Array<{ id: string; url: string; retrieved_at: string }>;
  };
  catalog: {
    version: string;
    generated_at: string;
    source: "aggregated" | "models.dev" | "fallback_sample";
    total: number;
    providers: number;
    sources: CatalogSourceStatus[];
    files: {
      index: string;
      providers: Record<string, string>;
    };
  };
}
