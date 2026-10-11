/**
 * 多语言：构建时为每种语言生成一套静态页。默认语言在 /，其他语言在 /<code>/。运行时不加载文案。
 * 新增语言：1) 复制 en.ts 翻译为 <code>.ts（Dict 类型强制与 zh.ts 同构）；2) 在 LOCALES 与 DICTS 各登记一行；
 * 3) 模型简介译文（data/models 的 translations）的语言代码随 LOCALES 生效，同时更新 scripts/validate-data.mjs 的 LANGS。
 */
import { zh, type Dict } from './zh';
import { en } from './en';

export const LOCALES = [
  { code: 'zh', label: '简体中文', htmlLang: 'zh-CN' },
  { code: 'en', label: 'English', htmlLang: 'en' },
] as const;

export type Lang = (typeof LOCALES)[number]['code'];
export type { Dict };
export const DEFAULT_LANG: Lang = 'zh';
/** 需要加路径前缀的语言，供动态路由 getStaticPaths 使用 */
export const PREFIXED_LANGS = LOCALES.map((l) => l.code).filter((c) => c !== DEFAULT_LANG);

const DICTS: Record<Lang, Dict> = { zh, en };

export const dict = (lang: Lang): Dict => DICTS[lang];
export const locale = (lang: Lang) => LOCALES.find((l) => l.code === lang)!;

/** 站内路径加语言前缀：localePath('en', '/models/') → '/en/models/' */
export const localePath = (lang: Lang, path: string) => (lang === DEFAULT_LANG ? path : `/${lang}${path}`);

/** 去掉语言前缀，得到与语言无关的路径 */
export function basePath(pathname: string): string {
  const m = /^\/([^/]+)(\/.*)?$/.exec(pathname);
  if (m && (PREFIXED_LANGS as readonly string[]).includes(m[1]!)) return m[2] || '/';
  return pathname;
}

/** 动态路由参数 → 语言，非法值在构建期就会因 getStaticPaths 不包含而不生成 */
export const asLang = (v: string | undefined): Lang => (LOCALES.some((l) => l.code === v) ? (v as Lang) : DEFAULT_LANG);
