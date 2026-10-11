#!/usr/bin/env node
/** 离线完整性清单。空值不是错误：本脚本不声称官方已公开这些字段，也不替代回源核验。 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = new URL('../data/models/', import.meta.url);
const models = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
  .map((f) => JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8')));
const fields = ['pricing', 'limits.context', 'limits.input', 'limits.output', 'reasoning.supported',
  'info.release_date', 'info.knowledge_cutoff', 'info.description', 'info.docs'];
const get = (m, field) => field.split('.').reduce((v, key) => v?.[key], m);
const counts = (items) => Object.fromEntries([...new Set(items)].sort().map((key) => [key, items.filter((v) => v === key).length]));
const callable = (m) => m.info.status !== 'retired';
const summary = (list) => ({
  models: list.length,
  statuses: counts(list.map((m) => m.info.status)),
  null_fields: Object.fromEntries(fields.map((field) => [field, list.filter((m) => get(m, field) === null).length])),
  without_providers: list.filter((m) => !m.providers.length).length,
  without_endpoints: list.filter((m) => m.providers.every((p) => !Object.keys(p.endpoints).length)).length,
});
const report = {
  generated_at: new Date().toISOString(),
  source_directory: fileURLToPath(dir),
  scope: 'All local model records; no network requests or claims of exhaustive official verification.',
  interpretation: 'Null fields and absent endpoints require review, not automatic filling. Some are unpublished, inapplicable, mixed-price, historical, or conflicting. Deprecated models are still callable.',
  all: summary(models),
  callable: summary(models.filter(callable)),
  vendors: Object.fromEntries([...new Set(models.map((m) => m.owned_by))].sort().map((owner) => [owner, summary(models.filter((m) => m.owned_by === owner))])),
  review_queue: models.flatMap((m) => {
    const missing = fields.filter((field) => get(m, field) === null);
    if (!m.providers.length) missing.push('providers');
    if (m.providers.every((p) => !Object.keys(p.endpoints).length)) missing.push('providers.endpoints');
    return missing.length ? [{ id: m.id, owned_by: m.owned_by, status: m.info.status, fields: missing, docs: m.info.docs }] : [];
  }),
};
console.log(JSON.stringify(report, null, 2));
