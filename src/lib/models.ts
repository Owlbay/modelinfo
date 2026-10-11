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

/** 格式化函数定义在 format.ts（不依赖构建期数据，客户端脚本也能引用），服务端从这里取用 */
export { formatTokens, formatPrice, formatCost } from './format';

/**
 * 比较页嵌入的紧凑记录：只含比较所需字段，按位置编码以减小页面体积。
 * 顺序：id, name, owned_by, kind, api.types, context, input, output, 输入模态, 输出模态,
 * reasoning.supported, reasoning.efforts, pricing, features, status, release_date, knowledge_cutoff, docs。
 * pricing 为 [currency, unit, input, output, cache_read, cache_write] 或 null。
 */
export type ComparePricing = [string, string, number | null, number | null, number | null, number | null];
export type CompareRecord = [
  string, string, string, Kind, string[],
  number | null, number | null, number | null, string[], string[],
  boolean | null, string[], ComparePricing | null, string[],
  Model['info']['status'], string | null, string | null, string | null,
];
export function toCompare(m: Model): CompareRecord {
  const p = m.pricing;
  return [
    m.id, m.name, m.owned_by, modelKind(m), m.api.types,
    m.limits.context, m.limits.input, m.limits.output, m.modalities.input, m.modalities.output,
    m.reasoning.supported, m.reasoning.efforts,
    p ? [p.currency, p.unit, p.input, p.output, p.cache_read, p.cache_write] : null,
    m.features, m.info.status, m.info.release_date, m.info.knowledge_cutoff, m.info.docs,
  ];
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

/** 某模型厂商最新的 n 个可用对话模型（只输出文本、非弃用、按百万 Token 计价），供比较页推荐组合；models 需已按发布顺序排序 */
export function latestChat(models: Model[], owner: string, n = 1): Model[] {
  return models
    .filter(
      (m) =>
        m.owned_by === owner &&
        m.info.status !== 'deprecated' &&
        m.modalities.output.every((o) => o === 'text') &&
        m.pricing?.unit === '1M_tokens',
    )
    .slice(0, n);
}
