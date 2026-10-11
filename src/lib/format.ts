/** 纯格式化函数：不依赖构建期数据，供客户端脚本直接引用；服务端代码经 models.ts 重新导出使用。 */
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

/** 估算费用：金额越小保留越多小数，避免显示为 0 */
export function formatCost(v: number, currency: string): string {
  const digits = v === 0 ? 2 : v < 0.01 ? 6 : v < 1 ? 4 : 2;
  return `${SYMBOL[currency] ?? `${currency} `}${v.toFixed(digits)}`;
}
