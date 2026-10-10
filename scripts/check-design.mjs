#!/usr/bin/env node
/**
 * 设计约束检查：组件与页面样式只能引用 src/styles/tokens.css 中的变量。
 * 报错项：写死的字号/行高/间距、字面颜色、transition: all、非零圆角。
 * 确有必要的例外，在同一行加注释 design-ok 并写明原因。
 *
 * 用法：node scripts/check-design.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['src/styles/tokens.css']);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(astro|css)$/.test(e.name)) out.push(p);
  }
  return out;
}

/** 返回 [起始行号, 样式文本] 列表；.astro 只取 <style> 块 */
function styleBlocks(file, text) {
  if (file.endsWith('.css')) return [[1, text]];
  const blocks = [];
  const re = /<style[^>]*>([\s\S]*?)<\/style>/g;
  let m;
  while ((m = re.exec(text))) {
    const line = text.slice(0, m.index).split('\n').length;
    blocks.push([line, m[1]]);
  }
  return blocks;
}

const RULES = [
  {
    name: '字号或行高写死',
    test: (l) => /\b(font-size|line-height)\s*:[^;]*\b\d+(\.\d+)?px/.test(l) || /\bfont\s*:[^;]*\b\d+(\.\d+)?px/.test(l),
  },
  {
    name: '间距写死（请用 --sp-*）',
    test: (l) => {
      const m = /\b(padding|margin|gap|column-gap|row-gap)(-[a-z-]+)?\s*:([^;]+)/.exec(l);
      if (!m) return false;
      const px = m[3].match(/\b\d+(\.\d+)?px\b/g) ?? [];
      return px.some((v) => !['0px', '1px', '2px'].includes(v));
    },
  },
  {
    name: '字面颜色（请用颜色变量）',
    test: (l) => !/mask(-image)?\s*:/.test(l) && /(#[0-9a-fA-F]{3,8}\b|\b(rgb|rgba|hsl|hsla|oklch)\()/.test(l),
  },
  { name: 'transition: all', test: (l) => /transition(-property)?\s*:[^;]*\ball\b/.test(l) },
  {
    name: '非零圆角',
    test: (l) => {
      const m = /border-radius\s*:\s*([^;]+)/.exec(l);
      return !!m && !/^(0(px)?|var\(.+\))\s*(!important)?$/.test(m[1].trim());
    },
  },
];

const problems = [];
for (const file of walk(path.join(root, 'src'))) {
  const rel = path.relative(root, file).split(path.sep).join('/');
  if (SKIP.has(rel)) continue;
  const text = fs.readFileSync(file, 'utf8');
  for (const [start, css] of styleBlocks(file, text)) {
    css.split('\n').forEach((line, i) => {
      if (line.includes('design-ok') || /^\s*(\/\*|\*)/.test(line)) return;
      for (const r of RULES) if (r.test(line)) problems.push(`${rel}:${start + i}  ${r.name}  ${line.trim()}`);
    });
  }
}

if (problems.length) {
  console.error(`设计约束检查未通过（${problems.length} 处）：\n` + problems.join('\n'));
  process.exit(1);
}
console.log('设计约束检查通过');
