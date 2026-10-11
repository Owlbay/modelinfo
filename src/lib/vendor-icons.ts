/** 模型厂商 logo 原始 SVG（@lobehub/icons-static-svg，构建时读取）；VendorLogo 内联与图标精灵共用 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { vendor } from './models';

const require = createRequire(import.meta.url);
const cache = new Map<string, VendorSvg | null>();

export interface VendorSvg {
  /** 精灵 symbol id */
  symbol: string;
  /** 根元素属性（viewBox、fill、fill-rule 等），已去掉宽高、样式与 xmlns */
  attrs: string;
  inner: string;
}

export function vendorSvg(id: string): VendorSvg | null {
  const icon = vendor(id)?.icon;
  if (!icon) return null;
  if (cache.has(icon)) return cache.get(icon)!;
  let out: VendorSvg | null = null;
  try {
    const raw = fs.readFileSync(require.resolve(`@lobehub/icons-static-svg/icons/${icon}.svg`), 'utf8').replace(/<title>.*?<\/title>/s, '');
    const m = /<svg([^>]*)>([\s\S]*)<\/svg>/.exec(raw);
    if (m) {
      const attrs = m[1]!.replace(/\s(width|height|style|xmlns(:\w+)?)="[^"]*"/g, '').trim();
      out = { symbol: `vl-${icon}`, attrs, inner: m[2]!.trim() };
    }
  } catch {
    out = null;
  }
  cache.set(icon, out);
  return out;
}
