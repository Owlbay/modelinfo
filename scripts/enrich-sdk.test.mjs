import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchSupportRule, resolveSDK } from './enrich-sdk.mjs';
import { modelDocument } from './scan-sdk-docs.mjs';
const model = { id: 'example-model', owned_by: 'official', api: { types: ['chat', 'video'] }, providers: [{ id: 'official', model: 'example-model', base_url: 'https://official.example', endpoints: { chat: 'POST /v1/chat/completions', video: 'POST /custom-video' } }] };
const rule = { sdk: '@ai-sdk/openai-compatible', types: ['chat'], endpoint_patterns: { chat: '^POST /(?:.*\\/)?chat/completions$' } };
test('protocol matching does not assign a chat SDK to a video or custom chat route', () => {
  assert.deepEqual(matchSupportRule(model, rule).map((m) => m.type), ['chat']);
  const custom = structuredClone(model);
  custom.providers[0].endpoints.chat = 'POST /v1/chat';
  assert.deepEqual(matchSupportRule(custom, rule), []);
  assert.deepEqual(matchSupportRule(model, { ...rule, owners: ['other'] }), []);
});
test('provider identity and service address are required when scoped by the evidence', () => {
  assert.deepEqual(matchSupportRule(model, { ...rule, provider_ids: ['vertex-ai'] }), []);
  assert.deepEqual(matchSupportRule(model, { ...rule, base_url_pattern: '^https://other\\.example/' }), []);
});
test('only explicitly documented model/API mappings can fill absent endpoints', () => {
  const missing = structuredClone(model);
  missing.providers[0].endpoints = {};
  assert.deepEqual(matchSupportRule(missing, rule), []);
  const explicit = { ...rule, model_protocols: { 'example-model': ['chat'] } };
  assert.equal(matchSupportRule(missing, explicit)[0].endpoint, null);
  assert.deepEqual(matchSupportRule(missing, { ...explicit, model_protocols: { 'other-model': ['chat'] } }), []);
  const wrong = structuredClone(model);
  wrong.providers[0].endpoints.chat = 'POST /custom';
  assert.deepEqual(matchSupportRule(wrong, explicit), []);
});
test('refresh removes stale generated packages, retains independent additions and catalog evidence', () => {
  assert.deepEqual(resolveSDK(['old-sdk', 'manual-sdk'], ['old-sdk'], ['catalog-sdk'], ['new-sdk', 'new-sdk']), ['catalog-sdk', 'manual-sdk', 'new-sdk']);
});
test('models without docs use original official sources, excluding SDK metadata', () => {
  const record = { info: { docs: null }, sources: [{ title: 'SDK support — x', url: 'https://sdk.example' }, { title: 'models.dev — SDK', url: 'https://models.dev/api.json' }, { title: 'Official model retirement', url: 'https://official.example/retirement' }] };
  assert.equal(modelDocument(record), 'https://official.example/retirement');
});
