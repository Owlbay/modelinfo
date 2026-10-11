import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
const original = JSON.parse(fs.readFileSync(new URL('data/models/deepseek-flash.json', root), 'utf8'));

function validate(change) {
  const model = structuredClone(original);
  change(model);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'modelquay-validation-'));
  try {
    const file = path.join(dir, `${model.id}.json`);
    fs.writeFileSync(file, JSON.stringify(model));
    return spawnSync(process.execPath, [new URL('scripts/validate-data.mjs', root).pathname, file], { encoding: 'utf8' });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('rejects an input limit larger than the total context', () => {
  const result = validate((m) => { m.limits = { context: 128000, input: 272000, output: 16384 }; });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /limits.input 不能大于 context/);
});

test('rejects a provider output override larger than its context', () => {
  const result = validate((m) => { m.providers[0].limits = { context: 100, input: null, output: 101 }; });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /providers\[0\].limits.output 不能大于 context/);
});

test('independent maxima need not fit simultaneously; unknown input remains valid', () => {
  for (const input of [null, 100]) {
    const result = validate((m) => { m.limits = { context: 100, input, output: 100 }; });
    assert.equal(result.status, 0, result.stderr);
  }
});

test('rejects an endpoint absent from the published API types', () => {
  const result = validate((m) => { m.api.types = m.api.types.filter((t) => t !== 'responses'); });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /endpoints.responses 未包含在 api.types/);
});

test('rejects Chat Completions mislabeled as Messages', () => {
  const result = validate((m) => { m.providers[0].endpoints.messages = 'POST /v1/chat/completions'; });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Chat Completions 不能标为 messages/);
});

test('rejects reasoning parameters for an unregistered endpoint', () => {
  const result = validate((m) => { m.providers[0].reasoning_params = { realtime: 'reasoning.effort' }; });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /reasoning_params.realtime/);
});

test('accepts per-protocol parameters and Google Interactions as a distinct type', () => {
  const result = validate((m) => {
    m.api.types.push('interactions');
    m.providers[0].endpoints.interactions = 'POST /v1beta/interactions';
    m.providers[0].reasoning_params = { chat: 'reasoning_effort', responses: 'reasoning.effort', interactions: null };
  });
  assert.equal(result.status, 0, result.stderr);
});

test('accepts a secure WebSocket provider without pretending it is HTTP', () => {
  const result = validate((m) => {
    m.api.types.push('realtime');
    m.providers.push({ id: 'example', model: m.id, base_url: 'wss://example.com', endpoints: { realtime: 'WS /v1/realtime' }, reasoning_param: null });
  });
  assert.equal(result.status, 0, result.stderr);
});

test('rejects a WebSocket method on an HTTPS provider', () => {
  const result = validate((m) => { m.providers[0].endpoints.chat = 'WS /v1/chat'; });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /WS 使用 wss/);
});
