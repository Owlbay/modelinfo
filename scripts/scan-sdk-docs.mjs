#!/usr/bin/env node
/** SDK 调研：扫描每个模型的官方文档（缺省使用首个官方来源），仅保存状态和摘要，不保存网页全文。 */
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const modelDocument = (model) => model.info.docs ?? model.sources.find((source) => !source.title.startsWith('SDK support — ') && source.url !== 'https://models.dev/api.json')?.url;

async function main() {
  const [date] = process.argv.slice(2);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) throw new Error('用法：node scripts/scan-sdk-docs.mjs <YYYY-MM-DD>');
  const root = new URL('../', import.meta.url);
  const dir = new URL('data/models/', root);
  const models = fs.readdirSync(dir).filter((file) => file.endsWith('.json')).map((file) => JSON.parse(fs.readFileSync(new URL(file, dir), 'utf8')));
  const urls = [...new Set(models.map(modelDocument).filter(Boolean))].sort();
  let next = 0;
  const results = new Array(urls.length);
  // 六个独立 GET；不调用模型、不带 API Key。
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (next < urls.length) {
      const index = next++;
      const url = urls[index];
      try {
        const response = await fetch(url, { headers: { 'User-Agent': 'ModelInfo-SDK-Review/1.0' }, signal: AbortSignal.timeout(15_000) });
        if (!response.ok) {
          results[index] = { url, final_url: response.url, status: response.status, retrieved_at: date };
          continue;
        }
        const raw = Buffer.from(await response.arrayBuffer());
        const title = raw.toString('utf8').match(/<title[^>]*>(.*?)<\/title>/is)?.[1] ?? '';
        results[index] = { url, final_url: response.url, status: response.status, bytes: raw.length, sha256: createHash('sha256').update(raw).digest('hex'), challenge: /Just a moment|Access Denied|Attention Required/i.test(title), retrieved_at: date };
      } catch (error) {
        results[index] = { url, status: 'failed', error: error.message, retrieved_at: date };
      }
      if ((index + 1) % 50 === 0) console.log(`已分配 ${index + 1}/${urls.length} 个文档请求`);
    }
  }));
  const file = new URL(`docs/audits/sdk-documents-${date}.json`, root);
  fs.writeFileSync(file, JSON.stringify(results, null, 2) + '\n');
  console.log(JSON.stringify({ models: models.length, urls: urls.length, readable: results.filter((r) => r.status === 200 && !r.challenge).length, report: file.pathname }));
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await main();
