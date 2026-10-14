import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const script = new URL('./completeness.mjs', import.meta.url);

function run(args = []) {
  return spawnSync(process.execPath, [script.pathname, ...args], { encoding: 'utf8' });
}

test('prints a vendor-by-field null report', () => {
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.ok(report.all.models > 1000);
  for (const field of ['limits.context', 'limits.input', 'limits.output', 'pricing', 'reasoning.supported', 'info.release_date', 'info.knowledge_cutoff', 'info.description', 'info.docs']) {
    assert.equal(typeof report.all.null_fields[field], 'number');
  }
  for (const part of ['input', 'output', 'cache_read', 'cache_write']) {
    assert.equal(typeof report.all.pricing_components_null_when_priced[part], 'number');
  }
  assert.ok(report.vendors.openai);
  assert.equal(report.callable.models < report.all.models, true);
  assert.equal(report.all.sources_empty, 0);
});

test('filters one vendor and can list model ids', () => {
  const result = run(['--vendor', 'deepseek', '--ids']);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(report.vendors), ['deepseek']);
  assert.ok(report.models.every((m) => m.owned_by === 'deepseek' && m.fields.length));
});

test('rejects an unknown vendor', () => {
  const result = run(['--vendor', 'not-a-vendor']);
  assert.equal(result.status, 1);
});
