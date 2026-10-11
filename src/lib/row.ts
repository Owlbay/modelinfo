/**
 * 模型列表行的单元格文本。ModelRow 渲染与 ModelsView 计算全字段视图列宽共用同一份文本，保证列宽按实际内容取值。
 */
import { formatPrice, formatTokens, modelKind, ownerName, type Model } from './models';
import type { Dict } from '../i18n';

const list = (v: string[]) => (v.length ? v.join(' · ') : '—');

export function rowCells(m: Model, d: Dict) {
  const p = m.pricing;
  // 非 Token 计价时在价格后标注单位
  const unit = p && p.unit !== '1M_tokens' ? ` / ${d.units[p.unit]}` : '';
  const efforts = list(m.reasoning.efforts);
  return {
    owner: ownerName(m.owned_by),
    kind: d.models.kinds[modelKind(m)],
    api: list(m.api.types),
    context: formatTokens(m.limits.context),
    input: formatTokens(m.limits.input),
    output: formatTokens(m.limits.output),
    reasoning: m.reasoning.supported === null ? '—' : m.reasoning.supported ? (efforts === '—' ? d.model.yes : efforts) : d.model.no,
    price: p ? `${formatPrice(p.input, p.currency)} / ${formatPrice(p.output, p.currency)}${unit}` : '—',
    cache: p && (p.cache_read !== null || p.cache_write !== null) ? `${formatPrice(p.cache_read, p.currency)} / ${formatPrice(p.cache_write, p.currency)}` : '—',
    features: list(m.features),
    status: d.model.status[m.info.status],
    release: m.info.release_date ?? '—',
    cutoff: m.info.knowledge_cutoff ?? '—',
  };
}

/** 等宽字体下的显示宽度（ch）：中日韩全角字符约 1.7ch */
export function monoWidth(s: string): number {
  let w = 0;
  for (const ch of s) w += /[⺀-￯]/.test(ch) ? 1.7 : 1;
  return w;
}
