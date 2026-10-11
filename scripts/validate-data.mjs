#!/usr/bin/env node
/**
 * 快速校验 data/models/*.json（与 src/content.config.ts 的规则一致，供并行编辑时单独运行）。
 * 用法：node scripts/validate-data.mjs [文件...]   不带参数校验全部。
 * 最终以 pnpm check / pnpm build 的 schema 校验为准。
 */
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'data', 'models');
const VENDOR_DIR = path.join(DIR, '..', 'vendors');
const VENDORS = new Set(fs.readdirSync(VENDOR_DIR).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)));
const KEYS = ['id', 'object', 'created', 'owned_by', 'name', 'api', 'limits', 'modalities', 'reasoning', 'pricing', 'features', 'info', 'aliases', 'translations', 'sources', 'providers'];
// translations 可省略；语言代码与 src/i18n/index.ts 的 LOCALES 一致
const OPTIONAL = new Set(['translations']);
const LANGS = ['zh', 'en'];
const API = ['chat', 'messages', 'responses', 'completions', 'generate', 'batch', 'realtime', 'embeddings', 'images', 'video', 'audio', '3d', 'rerank', 'ocr', 'moderation'];
const MOD = ['text', 'image', 'audio', 'video', 'document', 'embedding', 'score', '3d'];
const FEAT = ['tools', 'structured_output', 'streaming', 'caching', 'batch'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UNITS = ['1M_tokens', '1M_characters', 'image', 'second', 'minute', 'hour', 'request', 'page'];

const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => path.join(DIR, f));

let bad = 0;
const ids = new Map();
for (const file of files) {
  const errs = [];
  const e = (m) => errs.push(m);
  let m;
  try {
    m = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.error(`✗ ${file}: JSON 解析失败 ${err.message}`);
    bad++;
    continue;
  }
  const keys = Object.keys(m);
  const expect = KEYS.filter((k) => !OPTIONAL.has(k) || k in m);
  if (keys.join() !== expect.join()) e(`顶层字段与顺序必须为 ${KEYS.join(', ')}（translations 可省略）；实际 ${keys.join(', ')}`);
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(m.id ?? '')) e('id 只能是小写字母数字 . _ -');
  if (path.basename(file) !== `${m.id}.json`) e('文件名必须为 <id>.json');
  if (ids.has(m.id)) e(`id 与 ${ids.get(m.id)} 重复`);
  ids.set(m.id, file);
  if (m.object !== 'model') e('object 必须为 "model"');
  if (!(m.created === null || (Number.isInteger(m.created) && m.created > 0))) e('created 为 Unix 秒或 null');
  if (!/^[a-z0-9-]+$/.test(m.owned_by ?? '')) e('owned_by 只能是小写字母数字 -');
  else if (!VENDORS.has(m.owned_by)) e(`owned_by "${m.owned_by}" 未在 data/vendors/ 登记（需新增 data/vendors/${m.owned_by}.json）`);
  if (!m.name) e('name 必填');
  if (!Array.isArray(m.api?.types) || !m.api.types.length || m.api.types.some((t) => !API.includes(t)) || Object.keys(m.api).join() !== 'types') e(`api 只含 types，取值 ${API.join('|')}`);
  const tok = (v) => v === null || (Number.isInteger(v) && v > 0);
  if (!m.limits || Object.keys(m.limits).join() !== 'context,input,output' || !['context', 'input', 'output'].every((k) => tok(m.limits[k]))) e('limits 为 {context,input,output}，正整数或 null');
  if (!m.modalities || Object.keys(m.modalities).join() !== 'input,output' || !['input', 'output'].every((k) => Array.isArray(m.modalities[k]) && m.modalities[k].length && m.modalities[k].every((x) => MOD.includes(x)))) e(`modalities 为 {input,output}，取值 ${MOD.join('|')}`);
  if (!m.reasoning || Object.keys(m.reasoning).join() !== 'supported,efforts' || !(m.reasoning.supported === null || typeof m.reasoning.supported === 'boolean') || !Array.isArray(m.reasoning.efforts)) e('reasoning 为 {supported: bool|null, efforts: string[]}');
  const price = (v) => v === null || (typeof v === 'number' && v >= 0);
  const checkPricing = (p, where) => {
    if (p === null) return;
    if (!p || Object.keys(p).join() !== 'currency,unit,input,output,cache_read,cache_write' || !/^[A-Z]{3}$/.test(p.currency) || !UNITS.includes(p.unit) || !['input', 'output', 'cache_read', 'cache_write'].every((k) => price(p[k]))) e(`${where} 为 {currency,unit,input,output,cache_read,cache_write} 或 null；unit 取值 ${UNITS.join('|')}`);
  };
  checkPricing(m.pricing, 'pricing');
  if (!Array.isArray(m.features) || m.features.some((f) => !FEAT.includes(f))) e(`features 取值 ${FEAT.join('|')}`);
  const i = m.info ?? {};
  if (Object.keys(i).join() !== 'status,release_date,knowledge_cutoff,description,docs,verified_at') e('info 字段与顺序为 status,release_date,knowledge_cutoff,description,docs,verified_at');
  if (!['preview', 'active', 'deprecated', 'retired'].includes(i.status)) e('info.status 为 preview|active|deprecated|retired');
  if (!(i.release_date === null || DATE.test(i.release_date))) e('info.release_date 为 YYYY-MM-DD 或 null');
  if (!(i.verified_at === null || DATE.test(i.verified_at))) e('info.verified_at 为 YYYY-MM-DD 或 null');
  if (!(i.docs === null || /^https?:\/\//.test(i.docs))) e('info.docs 为 URL 或 null');
  if (m.created !== null && i.release_date !== new Date(m.created * 1000).toISOString().slice(0, 10)) e('release_date 必须等于 created 的 UTC 日期');
  if (m.created === null && i.release_date !== null) e('有 release_date 时 created 不能为空');
  if (!Array.isArray(m.aliases)) e('aliases 为数组');
  if ('translations' in m) {
    const t = m.translations;
    if (!t || typeof t !== 'object' || Array.isArray(t)) e('translations 为 {语言代码: {description}}');
    else
      for (const [lang, v] of Object.entries(t)) {
        if (!LANGS.includes(lang)) e(`translations 的语言代码取值 ${LANGS.join('|')}`);
        if (!v || Object.keys(v).join() !== 'description' || typeof v.description !== 'string' || !v.description) e(`translations.${lang} 只含非空 description`);
      }
    if (!i.description && t && Object.keys(t).length) e('info.description 为 null 时不能有译文');
  }
  if (!Array.isArray(m.sources) || !m.sources.length || m.sources.some((s) => Object.keys(s).join() !== 'title,url,retrieved_at' || !s.url.startsWith('https://') || !DATE.test(s.retrieved_at))) e('sources 至少一条 {title,url(https),retrieved_at}');
  if (!Array.isArray(m.providers)) e('providers 为数组');
  for (const [n, p] of (m.providers ?? []).entries()) {
    const allowed = ['id', 'model', 'base_url', 'endpoints', 'reasoning_param', 'reasoning_efforts', 'limits', 'modalities', 'features', 'pricing'];
    const extra = Object.keys(p).filter((k) => !allowed.includes(k));
    if (extra.length) e(`providers[${n}] 多余字段 ${extra.join(',')}`);
    if (!p.id || !p.model || !String(p.base_url).startsWith('https://')) e(`providers[${n}] 需要 id、model、https base_url`);
    for (const [k, v] of Object.entries(p.endpoints ?? {})) {
      if (!API.includes(k) || !/^(GET|POST) \//.test(v)) e(`providers[${n}].endpoints.${k} 格式为 "POST /path"`);
    }
    if (!('reasoning_param' in p)) e(`providers[${n}] 需要 reasoning_param（可为 null）`);
    if ('pricing' in p) checkPricing(p.pricing, `providers[${n}].pricing`);
  }
  if (errs.length) {
    bad++;
    console.error(`✗ ${path.basename(file)}\n  - ${errs.join('\n  - ')}`);
  }
}
// 全库唯一：模型 ID 与别名共用一个命名空间（别名不能等于其他模型的 ID，也不能同时出现在两个文件里）。
// 只校验部分文件时也对照全部文件，避免新文件与已有别名冲突。
const names = new Map();
const clash = [];
for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.json'))) {
  let m;
  try {
    m = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  } catch {
    continue;
  }
  for (const [n, kind] of [[m.id, 'id'], ...(Array.isArray(m.aliases) ? m.aliases.map((a) => [a, '别名']) : [])]) {
    const prev = names.get(n);
    if (prev && prev.file !== f) clash.push(`${n}：${prev.file}（${prev.kind}）与 ${f}（${kind}）`);
    else if (prev && kind === '别名' && prev.kind === '别名') clash.push(`${n}：${f} 内重复别名`);
    else if (!prev) names.set(n, { file: f, kind });
  }
}
if (clash.length) {
  bad++;
  console.error(`✗ ID / 别名重复\n  - ${clash.join('\n  - ')}`);
}
console.log(`${files.length - (bad - (clash.length ? 1 : 0))}/${files.length} 通过${clash.length ? '，ID / 别名有重复' : ''}`);
process.exit(bad ? 1 : 0);
