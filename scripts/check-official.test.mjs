import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkModel,
  crossRows,
  diffHints,
  hostMatches,
  indexThirdParty,
  isSdkOnlySource,
  unwrapArchive,
  vendorHosts,
} from './check-official.mjs';

const vendorUrl = 'https://ai.google.dev';

function model(overrides = {}) {
  return {
    id: 'gemini-example',
    object: 'model',
    created: null,
    owned_by: 'google',
    name: 'Example',
    api: { types: ['generate'], sdk: [] },
    limits: { context: 1024, input: null, output: 512 },
    modalities: { input: ['text'], output: ['text'] },
    reasoning: { supported: null, efforts: [] },
    pricing: { currency: 'USD', unit: '1M_tokens', input: 1, output: 2, cache_read: null, cache_write: null },
    features: [],
    info: { status: 'active', release_date: null, knowledge_cutoff: null, description: null, docs: null, verified_at: '2026-10-13' },
    aliases: [],
    sources: [{ title: 'Models | Gemini API', url: 'https://ai.google.dev/gemini-api/docs/models', retrieved_at: '2026-10-13' }],
    providers: [],
    ...overrides,
  };
}

test('archive snapshots of an official host count, SDK pages do not', () => {
  const hosts = vendorHosts(vendorUrl, 'google');
  assert.equal(hostMatches('https://web.archive.org/web/20260521030432/https://ai.google.dev/gemini-api/docs/pricing', hosts), true);
  assert.equal(hostMatches('https://models.dev/api.json', hosts), false);
  assert.equal(isSdkOnlySource({ title: 'models.dev — SDK npm mapping (api.sdk only)', url: 'https://models.dev/api.json' }), true);
  assert.equal(unwrapArchive('https://web.archive.org/web/20260101/https://ai.google.dev/gemini-api/docs/models'), 'https://ai.google.dev/gemini-api/docs/models');
});

test('rejects a model whose only links are aggregators', () => {
  const result = checkModel(model({
    sources: [{ title: 'models.dev', url: 'https://models.dev/api.json', retrieved_at: '2026-10-13' }],
  }), vendorUrl, { today: '2026-10-13' });
  assert.match(result.errors.join('\n'), /官方域名/);
});

test('rejects a future verification date, a negative price, and an output above the context', () => {
  const result = checkModel(model({
    info: { verified_at: '2026-10-14' },
    limits: { context: 100, input: null, output: 200 },
    pricing: { currency: 'USD', unit: '1M_tokens', input: -1, output: 2, cache_read: null, cache_write: null },
  }), vendorUrl, { today: '2026-10-13' });
  assert.match(result.errors.join('\n'), /晚于/);
  assert.match(result.errors.join('\n'), /pricing.input/);
  assert.match(result.errors.join('\n'), /limits.output/);
});

test('stale dates warn and do not become errors', () => {
  const result = checkModel(model({
    info: { verified_at: '2025-01-01' },
    sources: [{ title: 'Models | Gemini API', url: 'https://ai.google.dev/gemini-api/docs/models', retrieved_at: '2025-01-01' }],
  }), vendorUrl, { today: '2026-10-13', maxAgeDays: 180 });
  assert.equal(result.errors.length, 0);
  assert.match(result.warnings.join('\n'), /已超过 180 天/);
});

test('cross comparison notes notation and discount gaps without editing values', () => {
  assert.deepEqual(diffHints(131072, 128000).some((note) => note.includes('1024')), true);
  assert.deepEqual(diffHints(0.68, 1.36).some((note) => note.includes('折扣')), true);
  assert.deepEqual(diffHints(30, 2.5).some((note) => note.includes('图像')), false);
  const local = model({ id: 'gemini-example', pricing: { currency: 'USD', unit: '1M_tokens', input: 2, output: 12, cache_read: null, cache_write: null } });
  const rows = indexThirdParty('openrouter', {
    data: [{ id: 'google/gemini-example', pricing: { prompt: '0.000001', completion: '0.000006' }, context_length: 1024, top_provider: { max_completion_tokens: 256 } }],
  });
  const diffs = crossRows(local, [['openrouter', rows]]);
  assert.equal(diffs.some((diff) => diff.field === 'pricing.input' && diff.candidate === 1), true);
  assert.equal(diffs.some((diff) => diff.field === 'limits.output'), true);
  assert.equal(local.pricing.input, 2);
});
