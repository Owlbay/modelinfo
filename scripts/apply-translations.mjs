#!/usr/bin/env node
/**
 * 批量写入模型简介译文：node scripts/apply-translations.mjs <语言代码> <译文.json>
 * 译文文件为 { "<模型 id>": "<译文>" }；写入 data/models/<id>.json 的 translations.<语言>.description，
 * 字段位置固定在 aliases 之后。原文为 null 的模型跳过；空字符串表示删除该语言译文。
 */
import fs from 'node:fs';
import path from 'node:path';

const [lang, file] = process.argv.slice(2);
if (!lang || !file) {
  console.error('用法：node scripts/apply-translations.mjs <语言代码> <译文.json>');
  process.exit(1);
}
const DIR = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'data', 'models');
const map = JSON.parse(fs.readFileSync(file, 'utf8'));
let done = 0;
for (const [id, text] of Object.entries(map)) {
  const p = path.join(DIR, `${id}.json`);
  if (!fs.existsSync(p)) {
    console.error(`跳过 ${id}：文件不存在`);
    continue;
  }
  const raw = fs.readFileSync(p, 'utf8');
  const m = JSON.parse(raw);
  if (!m.info.description) {
    console.error(`跳过 ${id}：info.description 为 null`);
    continue;
  }
  const t = { ...(m.translations ?? {}) };
  if (text) t[lang] = { description: String(text).trim() };
  else delete t[lang];
  const out = {};
  for (const [k, v] of Object.entries(m)) {
    if (k === 'translations') continue;
    out[k] = v;
    if (k === 'aliases' && Object.keys(t).length) out.translations = t;
  }
  fs.writeFileSync(p, JSON.stringify(out, null, 2) + (raw.endsWith('\n') ? '\n' : ''));
  done++;
}
console.log(`已写入 ${done} 个文件`);
