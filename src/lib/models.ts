/** 模型数据读取与格式化。页面只通过这里取数。 */
import { getCollection, type CollectionEntry } from 'astro:content';

export type Model = CollectionEntry<'models'>['data'];

/** 发布顺序：研发方，再按发布日期新到旧，未知日期排后 */
export async function getModels(): Promise<Model[]> {
  const list = (await getCollection('models')).map((e) => e.data);
  return list.sort(
    (a, b) =>
      a.owned_by.localeCompare(b.owned_by) ||
      (b.created ?? 0) - (a.created ?? 0) ||
      a.id.localeCompare(b.id),
  );
}

/** /v1/models 的单条记录：只保留标准字段，顺序固定 */
export function toPublic(m: Model) {
  const { id, object, created, owned_by, name, api, limits, modalities, reasoning, pricing, features, info } = m;
  return { id, object, created, owned_by, name, api, limits, modalities, reasoning, pricing, features, info };
}

export function formatTokens(v: number | null): string {
  if (v === null) return '—';
  if (v >= 1_000_000) return `${+(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${+(v / 1_000).toFixed(1)}K`;
  return String(v);
}

const SYMBOL: Record<string, string> = { USD: '$', CNY: '¥', EUR: '€' };
export function formatPrice(v: number | null, currency: string): string {
  if (v === null) return '—';
  return `${SYMBOL[currency] ?? `${currency} `}${+v.toFixed(4)}`;
}

/** 最近一次人工核验日期 */
export function latestVerified(models: Model[]): string | null {
  return models.map((m) => m.info.verified_at).filter((d): d is string => !!d).sort().at(-1) ?? null;
}

/** 研发方显示名；未登记时显示 owned_by 原值 */
export const OWNER_NAMES: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  alibaba: 'Alibaba',
  deepseek: 'DeepSeek',
  moonshot: 'Moonshot AI',
  zhipu: 'Zhipu AI',
  minimax: 'MiniMax',
  stepfun: 'StepFun',
  bytedance: 'ByteDance',
  baidu: 'Baidu',
  tencent: 'Tencent',
  xiaomi: 'Xiaomi',
  iflytek: 'iFlytek',
  xai: 'xAI',
  mistral: 'Mistral AI',
  cohere: 'Cohere',
  amazon: 'Amazon',
  meta: 'Meta',
  ai21: 'AI21 Labs',
};
export const ownerName = (id: string) => OWNER_NAMES[id] ?? id;

/** 模型类型：按输出与接口归类，用于列表筛选 */
export const KINDS = ['chat', 'embedding', 'rerank', 'image', 'video', 'audio'] as const;
export type Kind = (typeof KINDS)[number];

export function modelKind(m: Model): Kind {
  const out = m.modalities.output;
  const api = m.api.types;
  if (out.includes('embedding') || api.includes('embeddings')) return 'embedding';
  if (out.includes('score') || api.includes('rerank')) return 'rerank';
  if (out.includes('text')) return 'chat';
  if (out.includes('video')) return 'video';
  if (out.includes('image')) return 'image';
  if (out.includes('audio')) return 'audio';
  return 'chat';
}
