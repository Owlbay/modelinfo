import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchSdk } from './import-sdk.mjs';
const model = { providers: [{ id: 'official', model: 'exact-id', base_url: 'https://official.example', endpoints: { chat: 'POST /v1/chat/completions' } }] };
const provider = { id: 'official', api: 'https://official.example/v1', npm: '@ai-sdk/openai-compatible', models: { 'exact-id': {} } };
test('matches endpoint base URL and uses model SDK override', () => {
  const remote = structuredClone(provider);
  remote.models['exact-id'].provider = { npm: '@ai-sdk/anthropic' };
  assert.deepEqual(matchSdk(model, { remote }).sdk, ['@ai-sdk/anthropic']);
  assert.deepEqual(matchSdk(model, { provider }).sdk, ['@ai-sdk/openai-compatible']);
});
test('does not inherit SDK from another gateway, plan or similar model ID', () => {
  for (const change of [
    { api: 'https://gateway.example/v1' },
    { api: 'https://official.example/coding/v1' },
    { models: { 'exact-id-preview': {} } },
    { api: undefined, id: 'gateway' },
  ]) assert.deepEqual(matchSdk(model, { remote: { ...provider, ...change } }).sdk, []);
});
test('accepts same provider without API metadata, keeps multiple compatible SDKs', () => {
  assert.deepEqual(matchSdk(model, { remote: { ...provider, api: undefined } }).sdk, [provider.npm]);
  const result = matchSdk(model, { a: provider, b: { ...provider, npm: '@ai-sdk/other' } });
  assert.deepEqual(result.sdk, [provider.npm, '@ai-sdk/other']);
});
