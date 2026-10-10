/** 模型数据读取与格式化。页面只通过这里取数。 */
import { getCollection, type CollectionEntry } from 'astro:content';

export type Model = CollectionEntry<'models'>['data'];

/** 发布顺序：按发布日期新到旧，未知日期排最后；同日按模型厂商、ID */
export async function getModels(): Promise<Model[]> {
  const list = (await getCollection('models')).map((e) => e.data);
  const unknown = [...new Set(list.map((m) => m.owned_by).filter((o) => !VENDORS.has(o)))];
  if (unknown.length) throw new Error(`data/vendors 缺少模型厂商：${unknown.join(', ')}`);
  return list.sort(
    (a, b) =>
      (b.created ?? -1) - (a.created ?? -1) ||
      a.owned_by.localeCompare(b.owned_by) ||
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

/** 模型厂商显示名，来自 data/vendors/*.json */
const VENDORS = new Map((await getCollection('vendors')).map((e) => [e.data.id, e.data]));
export const ownerName = (id: string) => VENDORS.get(id)?.name ?? id;
export const vendor = (id: string) => VENDORS.get(id);

/** 模型类型：按输出与接口归类，用于列表筛选 */
export const KINDS = ['chat', 'embedding', 'rerank', 'image', 'video', 'audio', '3d'] as const;
export type Kind = (typeof KINDS)[number];

export function modelKind(m: Model): Kind {
  const out = m.modalities.output;
  const api = m.api.types;
  if (out.includes('embedding') || api.includes('embeddings')) return 'embedding';
  if (out.includes('score') || api.includes('rerank')) return 'rerank';
  if (out.includes('text')) return 'chat';
  if (out.includes('3d')) return '3d';
  if (out.includes('video')) return 'video';
  if (out.includes('image')) return 'image';
  if (out.includes('audio')) return 'audio';
  return 'chat';
}
