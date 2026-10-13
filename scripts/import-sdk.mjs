#!/usr/bin/env node
/** 从离线 models.dev 快照导入 SDK；不请求网络、不更新人工核验日期。 */
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const normalize = (url) => url.replace(/\/+$/, '');
export function matchSdk(model, catalog) {
  const matches = [];
  for (const local of model.providers) {
    for (const remote of Object.values(catalog)) {
      const entry = remote.models?.[local.model];
      if (!entry) continue;
      const base = entry.provider?.api ?? remote.api;
      if (base) {
        const expected = normalize(base);
        const actual = normalize(local.base_url);
        // 只接受完整 base URL 或已登记端点落在该 API 下，不仅比较 hostname。
        if (actual !== expected && !Object.values(local.endpoints).some((endpoint) => {
          const full = actual + endpoint.replace(/^(GET|POST|WS) /, '');
          return full.startsWith(expected + '/');
        })) continue;
      } else if (local.id !== remote.id) continue;
      const sdk = entry.provider?.npm ?? remote.npm;
      if (typeof sdk !== 'string' || !/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+(?:\/[a-z0-9._-]+)*$/.test(sdk)) continue;
      matches.push({ provider: remote.id, model: local.model, sdk });
    }
  }
  const values = [...new Set(matches.map((m) => m.sdk))];
  return { sdk: values, matches };
}

function main() {
  const [snapshot, date] = process.argv.slice(2);
  if (!snapshot || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) throw new Error('用法：node scripts/import-sdk.mjs <models.dev api.json> <YYYY-MM-DD>');
  const raw = fs.readFileSync(snapshot);
  const catalog = JSON.parse(raw);
  const root = new URL('../', import.meta.url);
  const dir = new URL('data/models/', root);
  const records = [];
  const sourceUrl = 'https://models.dev/api.json';
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    const path = new URL(file, dir);
    const m = JSON.parse(fs.readFileSync(path, 'utf8'));
    const result = matchSdk(m, catalog);
    m.api = { types: m.api.types, sdk: [...new Set([...(Array.isArray(m.api.sdk) ? m.api.sdk : m.api.sdk ? [m.api.sdk] : []), ...result.sdk])] };
    if (result.sdk.length) {
      const source = { title: 'models.dev — SDK npm mapping (api.sdk only)', url: sourceUrl, retrieved_at: date };
      const old = m.sources.findIndex((s) => s.url === sourceUrl && s.title === source.title);
      if (old < 0) m.sources.push(source);
      else m.sources[old] = source;
    }
    fs.writeFileSync(path, JSON.stringify(m, null, 2) + '\n');
    records.push({ id: m.id, ...result });
  }
  const report = { source: sourceUrl, retrieved_at: date, sha256: createHash('sha256').update(raw).digest('hex'), total: records.length, matched: records.filter((r) => r.sdk.length).length, multiple: records.filter((r) => r.sdk.length > 1).length, records };
  fs.writeFileSync(new URL(`docs/audits/sdk-models-dev-${date}.json`, root), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ total: report.total, matched: report.matched, multiple: report.multiple }));
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main();
