#!/usr/bin/env node
/**
 * 检查模型来源是否落在厂商官方域名上，以及日期、价格和上下限是否合法。
 * 不修改 data/models。schema 与字段顺序仍以 scripts/validate-data.mjs 和构建时的 zod 为准。
 *
 * 用法：
 *   node scripts/check-official.mjs [--strict] [--max-age 180] [文件...]
 *   node scripts/check-official.mjs --cross [--report 路径]
 *
 * 退出码 1：缺官方域名来源、日期非法或晚于今天、价格为负、币种或单位非法、
 *           上下文小于输入或输出上限。
 * 警告默认不失败：verified_at 或 retrieved_at 早于 --max-age 天（默认 180）。
 * --strict 把警告也当作失败。
 *
 * --cross 下载 models.dev、OpenRouter、LiteLLM，按模型 ID 精确匹配后打印差异。
 * 差异只作提示，不改数据，也不因此失败。网络失败时退出码为 2。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODEL_DIR = path.join(ROOT, 'data', 'models');
const VENDOR_DIR = path.join(ROOT, 'data', 'vendors');
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UNITS = new Set(['1M_tokens', '1M_characters', 'image', 'second', 'minute', 'hour', 'request', 'page']);
const REQUIRED = ['id', 'object', 'created', 'owned_by', 'name', 'api', 'limits', 'modalities', 'reasoning', 'pricing', 'features', 'info', 'aliases', 'sources', 'providers'];

/**
 * 厂商官网主机之外、文档实际所在的域名。
 * 只收录该厂商自己的文档站，不把聚合站算进来。
 */
export const EXTRA_HOSTS = {
  aisingapore: ['sea-lion.ai'],
  alibaba: ['alibabacloud.com', 'aliyun.com', 'aliyuncs.com', 'qwenlm.github.io'],
  amazon: ['amazonaws.com', 'amazon.com'],
  anthropic: ['anthropic.com', 'claude.com'],
  baidu: ['baidu.com'],
  bytedance: ['volcengine.com', 'byteplus.com', 'doubao.com'],
  cohere: ['cohere.com', 'cohere.ai'],
  deepseek: ['deepseek.com'],
  google: ['google.dev', 'google.com', 'deepmind.google', 'deepmind.com'],
  iflytek: ['xfyun.cn', 'iflytek.com'],
  inception: ['inceptionlabs.ai'],
  kuaishou: ['kling.ai', 'streamlake.com'],
  lightricks: ['ltx.io'],
  meta: ['meta.com', 'meta.ai'],
  minimax: ['minimax.io', 'minimaxi.com'],
  mistral: ['mistral.ai'],
  moonshot: ['moonshot.ai', 'moonshot.cn', 'kimi.ai', 'kimi.com'],
  naver: ['ncloud.com', 'ncloud-docs.com'],
  openai: ['openai.com'],
  perplexity: ['perplexity.ai'],
  sakana: ['sakana.ai'],
  sensetime: ['sensetime.com', 'senseaudio.cn', 'sensenova.cn'],
  stepfun: ['stepfun.com', 'stepfun.ai'],
  tencent: ['tencent.com', 'tencentcloud.com', 'qq.com'],
  upstage: ['upstage.ai'],
  xai: ['x.ai'],
  xiaomi: ['mi.com', 'xiaomi.com'],
  zhipu: ['z.ai', 'bigmodel.cn'],
};

export function todayUtc(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

/** archive.org 快照还原成被存档的地址；其他 URL 原样返回。 */
export function unwrapArchive(url) {
  const host = hostOf(url);
  if (host !== 'web.archive.org') return url;
  const match = String(url).match(/\/web\/\d+(?:id_)?\/(https?:\/\/\S+)$/i);
  return match ? match[1] : url;
}

export function vendorHosts(vendorUrl, ownedBy) {
  const hosts = new Set(EXTRA_HOSTS[ownedBy] ?? []);
  const host = hostOf(vendorUrl);
  if (host) {
    hosts.add(host);
    const labels = host.split('.');
    if (labels.length >= 2) hosts.add(labels.slice(-2).join('.'));
  }
  return hosts;
}

export function hostMatches(url, hosts) {
  const host = hostOf(unwrapArchive(url));
  if (!host) return false;
  for (const allowed of hosts) {
    if (host === allowed || host.endsWith(`.${allowed}`)) return true;
  }
  return false;
}

export function isSdkOnlySource(source) {
  const title = source?.title ?? '';
  const url = source?.url ?? '';
  if (/api\.sdk only/i.test(title)) return true;
  const host = hostOf(url);
  return host === 'models.dev' || host === 'ai-sdk.dev';
}

function parseDay(value) {
  if (typeof value !== 'string' || !DATE.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

function ageDays(value, today) {
  const then = parseDay(value);
  const now = parseDay(today);
  if (!then || !now) return null;
  return Math.round((now.getTime() - then.getTime()) / 86400000);
}

function priceOk(value) {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
}

/**
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function checkModel(model, vendorUrl, options = {}) {
  const today = options.today ?? todayUtc();
  const maxAge = options.maxAgeDays ?? 180;
  const errors = [];
  const warnings = [];
  const error = (message) => errors.push(message);
  const warn = (message) => warnings.push(message);

  for (const key of REQUIRED) {
    if (!(key in (model ?? {}))) error(`缺少必填字段 ${key}`);
  }
  if (!model || typeof model !== 'object') return { errors, warnings };

  const limits = model.limits ?? {};
  for (const key of ['context', 'input', 'output']) {
    const value = limits[key];
    if (!(value === null || (Number.isInteger(value) && value > 0))) error(`limits.${key} 须为正整数或 null`);
  }
  if (limits.context != null) {
    for (const key of ['input', 'output']) {
      if (limits[key] != null && limits[key] > limits.context) error(`limits.${key} 不能大于 limits.context`);
    }
  }

  const pricing = model.pricing;
  if (pricing !== null && pricing !== undefined) {
    if (!/^[A-Z]{3}$/.test(pricing.currency ?? '')) error('pricing.currency 须为 ISO 4217 三字母代码');
    if (!UNITS.has(pricing.unit)) error(`pricing.unit 须为 ${[...UNITS].join('|')}`);
    for (const key of ['input', 'output', 'cache_read', 'cache_write']) {
      if (!priceOk(pricing[key])) error(`pricing.${key} 须为非负数或 null`);
    }
  }

  const verified = model.info?.verified_at;
  if (!(verified === null || verified === undefined || parseDay(verified))) error('info.verified_at 须为合法的 YYYY-MM-DD 或 null');
  if (parseDay(verified)) {
    const age = ageDays(verified, today);
    if (age < 0) error(`info.verified_at ${verified} 晚于 ${today}`);
    else if (age > maxAge) warn(`info.verified_at ${verified} 已超过 ${maxAge} 天`);
  }

  const sources = Array.isArray(model.sources) ? model.sources : [];
  if (!sources.length) error('sources 至少一条');
  const hosts = vendorHosts(vendorUrl, model.owned_by);
  let official = 0;
  for (const [index, source] of sources.entries()) {
    if (!source?.url?.startsWith('https://')) error(`sources[${index}].url 须为 https`);
    if (!parseDay(source?.retrieved_at)) error(`sources[${index}].retrieved_at 须为合法的 YYYY-MM-DD`);
    else {
      const age = ageDays(source.retrieved_at, today);
      if (age < 0) error(`sources[${index}].retrieved_at ${source.retrieved_at} 晚于 ${today}`);
      else if (age > maxAge) warn(`sources[${index}].retrieved_at ${source.retrieved_at} 已超过 ${maxAge} 天`);
    }
    if (!isSdkOnlySource(source) && hostMatches(source?.url, hosts)) official += 1;
  }
  if (sources.length && official === 0) {
    error(`sources 中没有 ${model.owned_by} 的官方域名链接（SDK 与 models.dev 来源不算）`);
  }
  return { errors, warnings };
}

/** 第三方数值与本地值的差异提示。不判断谁对。 */
export function diffHints(current, candidate) {
  if (current == null || candidate == null || current === candidate) return [];
  const notes = [];
  const ratio = Number(current) / Number(candidate);
  const near = (target) => Number.isFinite(ratio) && Math.abs(ratio - target) / target < 0.02;
  if (near(1.024) || near(1 / 1.024)) notes.push('可能是 1000 与 1024 的写法差异');
  if (near(2) || near(0.5) || near(0.75) || near(1 / 0.75) || near(0.8) || near(1.25)) notes.push('可能是折扣、批量价或渠道价');
  if (near(10) || near(0.1)) notes.push('可能是图像输出价与文本输出价的口径不同');
  return notes;
}

function asNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function perMillion(perToken) {
  const number = asNumber(perToken);
  return number == null ? null : Math.round(number * 1e6 * 1e6) / 1e6;
}

export function indexThirdParty(kind, payload) {
  const rows = new Map();
  const put = (id, fields) => {
    if (!id || typeof id !== 'string') return;
    rows.set(id.toLowerCase(), { id, ...fields });
  };
  if (kind === 'models.dev' && payload && typeof payload === 'object') {
    for (const provider of Object.values(payload)) {
      const models = provider?.models ?? {};
      for (const [id, model] of Object.entries(models)) {
        put(model?.id || id, {
          input: asNumber(model?.cost?.input),
          output: asNumber(model?.cost?.output),
          context: asNumber(model?.limit?.context),
          maxOutput: asNumber(model?.limit?.output),
        });
      }
    }
  }
  if (kind === 'openrouter') {
    for (const model of payload?.data ?? []) {
      put(model.id, {
        input: perMillion(model.pricing?.prompt),
        output: perMillion(model.pricing?.completion),
        context: asNumber(model.context_length),
        maxOutput: asNumber(model.top_provider?.max_completion_tokens ?? model.max_completion_tokens),
      });
    }
  }
  if (kind === 'litellm' && payload && typeof payload === 'object') {
    for (const [id, model] of Object.entries(payload)) {
      if (!model || typeof model !== 'object' || id.startsWith('sample_spec')) continue;
      put(model.litellm_provider ? `${model.litellm_provider}/${id}` : id, {
        input: perMillion(model.input_cost_per_token),
        output: perMillion(model.output_cost_per_token),
        context: asNumber(model.max_input_tokens ?? model.max_tokens),
        maxOutput: asNumber(model.max_output_tokens),
      });
      put(id, {
        input: perMillion(model.input_cost_per_token),
        output: perMillion(model.output_cost_per_token),
        context: asNumber(model.max_input_tokens ?? model.max_tokens),
        maxOutput: asNumber(model.max_output_tokens),
      });
    }
  }
  return rows;
}

export function matchThirdParty(model, rows) {
  const keys = [model.id, ...(model.aliases ?? [])].map((id) => String(id).toLowerCase());
  for (const [key, row] of rows) {
    const bare = key.includes('/') ? key.slice(key.lastIndexOf('/') + 1) : key;
    if (keys.includes(key) || keys.includes(bare)) return row;
  }
  return null;
}

export function crossRows(model, labeledRows) {
  const fields = [
    ['pricing.input', model.pricing?.input, 'input'],
    ['pricing.output', model.pricing?.output, 'output'],
    ['limits.context', model.limits?.context, 'context'],
    ['limits.output', model.limits?.output, 'maxOutput'],
  ];
  const diffs = [];
  for (const [source, rows] of labeledRows) {
    const remote = matchThirdParty(model, rows);
    if (!remote) continue;
    for (const [field, current, remoteKey] of fields) {
      const candidate = remote[remoteKey];
      if (current == null || candidate == null || current === candidate) continue;
      diffs.push({
        id: model.id,
        source,
        remoteId: remote.id,
        field,
        current,
        candidate,
        notes: diffHints(current, candidate),
      });
    }
  }
  return diffs;
}

function loadVendors() {
  const vendors = new Map();
  for (const file of fs.readdirSync(VENDOR_DIR).filter((name) => name.endsWith('.json'))) {
    const vendor = JSON.parse(fs.readFileSync(path.join(VENDOR_DIR, file), 'utf8'));
    vendors.set(vendor.id, vendor);
  }
  return vendors;
}

function modelFiles(args) {
  if (args.length) return args;
  return fs.readdirSync(MODEL_DIR).filter((name) => name.endsWith('.json')).map((name) => path.join(MODEL_DIR, name));
}

function parseArgs(argv) {
  const options = { strict: false, maxAgeDays: 180, cross: false, report: '', files: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--strict') options.strict = true;
    else if (arg === '--cross') options.cross = true;
    else if (arg === '--max-age') options.maxAgeDays = Number(argv[++i]);
    else if (arg === '--report') options.report = argv[++i];
    else options.files.push(arg);
  }
  return options;
}

async function runCross(files) {
  const endpoints = [
    ['models.dev', 'https://models.dev/api.json'],
    ['openrouter', 'https://openrouter.ai/api/v1/models'],
    ['litellm', 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json'],
  ];
  const labeled = [];
  for (const [name, url] of endpoints) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${name} HTTP ${response.status}`);
    labeled.push([name, indexThirdParty(name, await response.json())]);
  }
  const diffs = [];
  for (const file of files) {
    const model = JSON.parse(fs.readFileSync(file, 'utf8'));
    diffs.push(...crossRows(model, labeled));
  }
  return diffs;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const vendors = loadVendors();
  const files = modelFiles(options.files);
  const today = todayUtc();
  let errors = 0;
  let warnings = 0;
  for (const file of files) {
    let model;
    try {
      model = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      errors += 1;
      console.error(`✗ ${file}: JSON 解析失败 ${err.message}`);
      continue;
    }
    const vendor = vendors.get(model.owned_by);
    const result = checkModel(model, vendor?.url ?? '', { today, maxAgeDays: options.maxAgeDays });
    if (result.errors.length || result.warnings.length) {
      const name = path.basename(file);
      if (result.errors.length) {
        errors += 1;
        console.error(`✗ ${name}\n  - ${result.errors.join('\n  - ')}`);
      }
      if (result.warnings.length) {
        warnings += result.warnings.length;
        console.error(`! ${name}\n  - ${result.warnings.join('\n  - ')}`);
      }
    }
  }
  console.log(`${files.length - errors}/${files.length} 通过官方来源与范围检查${warnings ? `，${warnings} 条时效警告` : ''}`);

  if (options.cross) {
    try {
      const diffs = await runCross(files);
      const text = JSON.stringify({ generated_at: today, diffs }, null, 2);
      if (options.report) fs.writeFileSync(options.report, text);
      console.log(`交叉比对 ${diffs.length} 条差异（仅提示，未改数据）`);
      if (!options.report) console.log(text);
    } catch (err) {
      console.error(`交叉比对失败：${err.message}`);
      process.exit(2);
    }
  }
  if (errors || (options.strict && warnings)) process.exit(1);
}

const executed = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (executed) main();
