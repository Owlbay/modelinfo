#!/usr/bin/env node
/**
 * 按厂商、按字段统计 data/models 的空缺。
 * 用法：
 *   node scripts/completeness.mjs                 # JSON 摘要
 *   node scripts/completeness.mjs --ids           # 附带缺字段的模型 ID
 *   node scripts/completeness.mjs --vendor openai
 *   node scripts/completeness.mjs --markdown
 *
 * 空缺不是错误。模态在 schema 里必须是非空数组，本脚本不把「已填写的模态」当成空缺。
 * features 为空、以及 reasoning.supported 为 true 但 efforts 为空，单独计数：
 * 前者可能是未确认或不支持，后者可能是只有开关或 Token 预算。
 */
import fs from 'node:fs';

const dir = new URL('../data/models/', import.meta.url);
const args = process.argv.slice(2);
const wantIds = args.includes('--ids');
const markdown = args.includes('--markdown');
const vendorArg = args.includes('--vendor') ? args[args.indexOf('--vendor') + 1] : null;

const models = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
  .map((f) => JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8')));

const scalarFields = [
  'limits.context', 'limits.input', 'limits.output',
  'pricing',
  'reasoning.supported',
  'info.release_date', 'info.knowledge_cutoff', 'info.description', 'info.docs', 'info.verified_at',
];
const priceParts = ['input', 'output', 'cache_read', 'cache_write'];
const get = (m, field) => field.split('.').reduce((v, key) => v?.[key], m);
const callable = (m) => m.info.status !== 'retired';

function summary(list) {
  const null_fields = Object.fromEntries(scalarFields.map((field) => [
    field,
    list.filter((m) => get(m, field) === null).length,
  ]));
  const pricing_components = Object.fromEntries(priceParts.map((part) => [
    part,
    list.filter((m) => m.pricing && m.pricing[part] === null).length,
  ]));
  return {
    models: list.length,
    statuses: Object.fromEntries(['preview', 'active', 'deprecated', 'retired']
      .map((status) => [status, list.filter((m) => m.info.status === status).length])
      .filter(([, n]) => n)),
    null_fields,
    pricing_components_null_when_priced: pricing_components,
    features_empty: list.filter((m) => m.features.length === 0).length,
    reasoning_true_efforts_empty: list.filter((m) => m.reasoning.supported === true && m.reasoning.efforts.length === 0).length,
    sources_empty: list.filter((m) => !m.sources?.length).length,
    providers_empty: list.filter((m) => !m.providers?.length).length,
  };
}

function missingFields(m) {
  const missing = scalarFields.filter((field) => get(m, field) === null);
  if (m.pricing) {
    for (const part of priceParts) if (m.pricing[part] === null) missing.push(`pricing.${part}`);
  }
  if (!m.features.length) missing.push('features');
  if (m.reasoning.supported === true && !m.reasoning.efforts.length) missing.push('reasoning.efforts');
  if (!m.sources?.length) missing.push('sources');
  return missing;
}

const selected = vendorArg ? models.filter((m) => m.owned_by === vendorArg) : models;
const owners = [...new Set(selected.map((m) => m.owned_by))].sort();
const report = {
  generated_at: new Date().toISOString(),
  source_directory: 'data/models',
  scope: 'Local model records only. Null is not an error: values may be unpublished, inapplicable, mixed-price, historical, or conflicting.',
  modalities: 'modalities.input and modalities.output are required non-empty arrays, so they are not listed as null gaps.',
  all: summary(selected),
  callable: summary(selected.filter(callable)),
  vendors: Object.fromEntries(owners.map((owner) => {
    const list = selected.filter((m) => m.owned_by === owner);
    return [owner, { ...summary(list), callable: summary(list.filter(callable)) }];
  })),
};
if (wantIds) {
  report.models = selected.flatMap((m) => {
    const fields = missingFields(m);
    return fields.length ? [{ id: m.id, owned_by: m.owned_by, status: m.info.status, fields, docs: m.info.docs }] : [];
  });
}

if (!markdown) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const lines = ['# 模型字段空缺', '', `生成时间：${report.generated_at}`, '', report.scope, '', report.modalities, ''];
  const header = ['厂商', '模型', '可调用', ...scalarFields.map((f) => f.replace('limits.', 'l.').replace('info.', 'i.').replace('reasoning.', 'r.'))];
  lines.push(`| ${header.join(' | ')} |`);
  lines.push(`| ${header.map(() => '---').join(' | ')} |`);
  const row = (name, block) => `| ${name} | ${block.models} | ${block.callable?.models ?? ''} | ${scalarFields.map((f) => block.null_fields[f]).join(' | ')} |`;
  lines.push(row('全部', { ...report.all, callable: report.callable }));
  for (const owner of owners) lines.push(row(owner, report.vendors[owner]));
  lines.push('');
  console.log(lines.join('\n'));
}

if (vendorArg && !owners.length) {
  console.error(`未知厂商 ${vendorArg}`);
  process.exitCode = 1;
}
