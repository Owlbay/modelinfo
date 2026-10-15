import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkModel,
  crossRows,
  diffHints,
  hostMatches,
  indexThirdParty,
  isSdkOnlySource,
  parseArgs,
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

test('rejects a date more than one day ahead, a negative price, and an output above the context', () => {
  const tomorrow = checkModel(model({
    info: { verified_at: '2026-10-14' },
  }), vendorUrl, { today: '2026-10-13' });
  assert.equal(tomorrow.errors.some((message) => message.includes('晚于')), false);
  const result = checkModel(model({
    info: { verified_at: '2026-10-15' },
    limits: { context: 100, input: null, output: 200 },
    pricing: { currency: 'USD', unit: '1M_tokens', input: -1, output: 2, cache_read: null, cache_write: null },
  }), vendorUrl, { today: '2026-10-13' });
  assert.match(result.errors.join('\n'), /晚于/);
  assert.match(result.errors.join('\n'), /pricing.input/);
  assert.match(result.errors.join('\n'), /limits.output/);
});

test('public suffixes do not authorize every host under that suffix', () => {
  const cn = vendorHosts('https://docs.vendor.com.cn/models', 'unknown-vendor');
  assert.equal(hostMatches('https://evil.com.cn/pricing', cn), false);
  assert.equal(hostMatches('https://api.vendor.com.cn/v1', cn), true);
  const io = vendorHosts('https://qwenlm.github.io/blog', 'unknown-vendor');
  assert.equal(hostMatches('https://other.github.io/x', io), false);
  assert.equal(hostMatches('https://qwenlm.github.io/blog/post', io), true);
  const jp = vendorHosts('https://docs.example.co.jp/models', 'unknown-vendor');
  assert.equal(hostMatches('https://other.co.jp/pricing', jp), false);
  assert.equal(hostMatches('https://api.example.co.jp/v1', jp), true);
});

test('rejects a non-integer max age', () => {
  assert.match(parseArgs(['--max-age', 'abc']).error, /非负整数/);
  assert.match(parseArgs(['--max-age', '-1']).error, /非负整数/);
  assert.match(parseArgs(['--max-age', '1.5']).error, /非负整数/);
  assert.match(parseArgs(['--max-age']).error, /非负整数/);
  assert.equal(parseArgs(['--max-age', '0']).maxAgeDays, 0);
  assert.equal(parseArgs(['--max-age', '90']).error, '');
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

test('cross match does not take another provider or treat max input as context', () => {
  const mixed = indexThirdParty('litellm', {
    'gpt-4': {
      litellm_provider: 'azure',
      input_cost_per_token: 0.000001,
      output_cost_per_token: 0.000002,
      max_input_tokens: 4000,
      max_tokens: 4000,
      max_output_tokens: 1000,
    },
    'openai/gpt-4': {
      litellm_provider: 'openai',
      input_cost_per_token: 0.00003,
      output_cost_per_token: 0.00006,
      max_input_tokens: 4000,
      max_tokens: 8192,
      max_output_tokens: 4096,
    },
  });
  const local = model({
    id: 'gpt-4',
    owned_by: 'openai',
    limits: { context: 8192, input: 8192, output: 4096 },
    pricing: { currency: 'USD', unit: '1M_tokens', input: 30, output: 60, cache_read: null, cache_write: null },
  });
  const diffs = crossRows(local, [['litellm', mixed]]);
  assert.equal(diffs.some((diff) => diff.remoteId.startsWith('azure/')), false);
  assert.equal(diffs.some((diff) => diff.field === 'limits.context'), false);
  assert.equal(diffs.some((diff) => diff.field === 'limits.input' && diff.candidate === 4000), true);
  const dev = indexThirdParty('models.dev', {
    azure: { models: { 'gpt-4': { id: 'gpt-4', cost: { input: 1, output: 2 }, limit: { context: 4000, output: 1000 } } } },
    openai: { models: { 'gpt-4': { id: 'gpt-4', cost: { input: 30, output: 60 }, limit: { context: 8192, output: 4096 } } } },
  });
  const devDiffs = crossRows(local, [['models.dev', dev]]);
  assert.equal(devDiffs.length, 0);
});

test('cross comparison skips incompatible prices but still reports token limits', () => {
  const catalogs = [
    ['models.dev', { google: { models: { 'gemini-example': {
      cost: { input: 1, output: 2 }, limit: { context: 2048, output: 256 },
    } } } }],
    ['openrouter', { data: [{ id: 'google/gemini-example',
      pricing: { prompt: '0.000001', completion: '0.000002' }, context_length: 2048,
    }] }],
    ['litellm', { 'gemini-example': { litellm_provider: 'google',
      input_cost_per_token: 0.000001, output_cost_per_token: 0.000002, max_tokens: 2048,
    } }],
  ];
  for (const [source, payload] of catalogs) {
    const rows = indexThirdParty(source, payload);
    for (const [currency, unit] of [['CNY', '1M_tokens'], ['USD', '1M_characters'], ['USD', 'minute'], ['USD', 'page']]) {
      const local = model({ pricing: { currency, unit, input: 7, output: 20, cache_read: null, cache_write: null } });
      const before = JSON.stringify(local);
      const diffs = crossRows(local, [[source, rows]]);
      assert.equal(diffs.some((diff) => diff.field.startsWith('pricing.')), false, `${source}: ${currency}/${unit}`);
      assert.equal(diffs.some((diff) => diff.field === 'limits.context'), true);
      assert.equal(JSON.stringify(local), before);
    }
    const usd = model({ pricing: { currency: 'USD', unit: '1M_tokens', input: 7, output: 20, cache_read: null, cache_write: null } });
    assert.equal(crossRows(usd, [[source, rows]]).some((diff) => diff.field === 'pricing.input'), true);
  }
});
