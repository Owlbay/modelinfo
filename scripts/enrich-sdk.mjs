#!/usr/bin/env node
/** 按已核验 SDK 支持规则补录全库；支持范围和来源来自传入的调研快照。 */
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { modelDocument } from './scan-sdk-docs.mjs';

export function matchSupportRule(model, rule) {
  if (rule.owners && !rule.owners.includes(model.owned_by)) return [];
  if (rule.models && !rule.models.includes(model.id)) return [];
  if (rule.model_pattern && !new RegExp(rule.model_pattern).test(model.id)) return [];
  const matches = [];
  for (const provider of model.providers) {
    if (rule.provider_ids && !rule.provider_ids.includes(provider.id)) continue;
    if (rule.base_url_pattern && !new RegExp(rule.base_url_pattern).test(provider.base_url)) continue;
    for (const [type, endpoint] of Object.entries(provider.endpoints)) {
      if (!model.api.types.includes(type) || !rule.types.includes(type)) continue;
      if (rule.endpoint_patterns?.[type] && !new RegExp(rule.endpoint_patterns[type]).test(endpoint)) continue;
      matches.push({ provider: provider.id, model: provider.model, type, endpoint });
    }
  }
  if (!matches.length && model.providers.every((p) => !Object.keys(p.endpoints).length) && rule.model_protocols?.[model.id]) {
    for (const type of rule.model_protocols[model.id]) {
      if (model.api.types.includes(type) && rule.types.includes(type)) matches.push({ provider: null, model: model.id, type, endpoint: null, basis: rule.protocol_basis });
    }
  }
  return matches;
}

export function resolveSDK(existing, previouslyManaged, catalog, matches) {
  const manual = existing.filter((sdk) => !previouslyManaged.includes(sdk));
  return [...new Set([...manual, ...catalog, ...matches])].sort();
}

function main() {
  const [supportPath, scanPath] = process.argv.slice(2);
  if (!supportPath || !scanPath) throw new Error('用法：node scripts/enrich-sdk.mjs <SDK 支持快照> <官方文档扫描结果>');
  const support = JSON.parse(fs.readFileSync(supportPath, 'utf8'));
  const scan = JSON.parse(fs.readFileSync(scanPath, 'utf8'));
  const pages = new Map(scan.map((page) => [page.url, page]));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(support.retrieved_at)) throw new Error('支持快照需要 retrieved_at');
  for (const rule of support.rules) {
    if (!rule.sdk || !rule.types?.length || !rule.sources?.length || rule.sources.some((s) => s.status !== 200 || s.registry?.status !== 200 || s.registry?.name !== rule.sdk)) throw new Error(`未核验规则：${rule.id}`);
  }
  const root = new URL('../', import.meta.url);
  const dir = new URL('data/models/', root);
  const auditPath = new URL(`docs/audits/sdk-internet-scan-${support.retrieved_at}.json`, root);
  const previous = fs.existsSync(auditPath) ? JSON.parse(fs.readFileSync(auditPath, 'utf8')).records : [];
  const previousSDKs = new Map(previous.map((record) => [record.id, record.sdk]));
  const catalogPath = new URL(`docs/audits/sdk-models-dev-${support.retrieved_at}.json`, root);
  const catalog = fs.existsSync(catalogPath) ? JSON.parse(fs.readFileSync(catalogPath, 'utf8')).records : [];
  const catalogSDKs = new Map(catalog.map((record) => [record.id, record.sdk]));
  const records = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    const path = new URL(file, dir);
    const model = JSON.parse(fs.readFileSync(path, 'utf8'));
    const matches = support.rules.flatMap((rule) => {
      const endpoints = matchSupportRule(model, rule);
      return endpoints.length ? [{ sdk: rule.sdk, rule: rule.id, basis: rule.basis, endpoints, sources: rule.sources.map((s) => s.scope_url ?? s.url) }] : [];
    });
    const candidates = catalogSDKs.get(model.id) ?? [];
    const seed = candidates.filter((sdk) => matches.some((match) => match.sdk === sdk));
    const excluded = candidates.filter((sdk) => !seed.includes(sdk));
    model.api.sdk = resolveSDK(model.api.sdk, previousSDKs.get(model.id) ?? seed, seed, matches.map((m) => m.sdk));
    model.sources = model.sources.filter((source) => !source.title.startsWith('SDK support — ') && (seed.length || source.title !== 'models.dev — SDK npm mapping (api.sdk only)'));
    for (const match of matches) {
      for (const url of match.sources) {
        const title = `SDK support — ${match.sdk} (api.sdk only)`;
        const source = { title, url, retrieved_at: support.retrieved_at };
        const old = model.sources.findIndex((s) => s.url === url && s.title === title);
        if (old < 0) model.sources.push(source);
        else model.sources[old] = source;
      }
    }
    const modelDoc = modelDocument(model);
    const page = pages.get(modelDoc);
    records.push({ id: model.id, owned_by: model.owned_by, status: model.info.status, sdk: model.api.sdk, catalog_candidates: candidates, catalog_excluded: excluded.map((sdk) => ({ sdk, reason: 'Provider default npm metadata does not establish this model API family support; no matching verified SDK rule.' })), matches, model_document: page ?? { url: model.info.docs, status: 'not-scanned' }, remaining: model.api.sdk.length ? null : model.providers.every((p) => !Object.keys(p.endpoints).length) ? 'Registered endpoint is missing and no verified SDK/API-family or exact-model mapping was found.' : 'No verified npm SDK matching this model API family. HTTP-only examples, Python SDKs and other gateways do not establish npm SDK support.' });
    fs.writeFileSync(path, JSON.stringify(model, null, 2) + '\n');
  }
  const report = { retrieved_at: support.retrieved_at, scope: support.scope, total: records.length, with_sdk: records.filter((m) => m.sdk.length).length, multiple: records.filter((m) => m.sdk.length > 1).length, unresolved: records.filter((m) => !m.sdk.length).length, document_urls: pages.size, records };
  fs.writeFileSync(auditPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ total: report.total, with_sdk: report.with_sdk, multiple: report.multiple, unresolved: report.unresolved }));
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main();
