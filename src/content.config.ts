/**
 * 模型数据的唯一入口：data/models/*.json，构建时按 schema 校验，不合规即构建失败。
 * 字段定义见 docs/spec-v1-models.md。
 */
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { LOCALES } from './i18n';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const apiType = z.enum([
  'chat', 'messages', 'responses', 'interactions', 'completions', 'generate', 'batch', 'realtime',
  'embeddings', 'images', 'video', 'audio', '3d', 'rerank', 'ocr', 'moderation',
]);
const modality = z.enum(['text', 'image', 'audio', 'video', 'document', 'embedding', 'score', '3d']);
const feature = z.enum(['tools', 'structured_output', 'streaming', 'caching', 'batch']);
const tokens = z.number().int().positive().nullable();
const price = z.number().nonnegative().nullable();

const limits = z.object({ context: tokens, input: tokens, output: tokens }).strict().superRefine((v, ctx) => {
  for (const key of ['input', 'output'] as const) {
    if (v.context !== null && v[key] !== null && v[key] > v.context) {
      ctx.addIssue({ code: 'custom', path: [key], message: `${key} 不能大于 context；官方来源冲突时保留可确认值，其余写 null` });
    }
  }
});
const modalities = z.object({ input: z.array(modality).min(1), output: z.array(modality).min(1) }).strict();
/** 计价单位：Token 模型为 1M_tokens；媒体类按字符、张、秒、分钟、小时、次、页计费 */
const priceUnit = z.enum(['1M_tokens', '1M_characters', 'image', 'second', 'minute', 'hour', 'request', 'page']);
const pricing = z
  .object({
    currency: z.string().regex(/^[A-Z]{3}$/),
    unit: priceUnit,
    input: price,
    output: price,
    cache_read: price,
    cache_write: price,
  })
  .strict()
  .nullable();

const models = defineCollection({
  loader: glob({ pattern: '*.json', base: './data/models' }),
  schema: z
    .object({
      // 标准字段（发布到 /v1/models）
      id: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/),
      object: z.literal('model'),
      created: z.number().int().positive().nullable(),
      owned_by: z.string().regex(/^[a-z0-9-]+$/),
      name: z.string().min(1),
      api: z.object({ types: z.array(apiType).min(1), sdk: z.array(z.string().regex(/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+(?:\/[a-z0-9._-]+)*$/)).refine((values) => new Set(values).size === values.length, 'SDK 不能重复') }).strict(),
      limits,
      modalities,
      reasoning: z.object({ supported: z.boolean().nullable(), efforts: z.array(z.string()) }).strict(),
      pricing,
      features: z.array(feature),
      info: z
        .object({
          status: z.enum(['preview', 'active', 'deprecated', 'retired']),
          release_date: date.nullable(),
          knowledge_cutoff: z.string().nullable(),
          description: z.string().nullable(),
          docs: z.url().nullable(),
          verified_at: date.nullable(),
        })
        .strict(),
      // 维护字段（不发布）
      aliases: z.array(z.string()).default([]),
      // 介绍类文本的译文，键为界面语言代码；只翻译 info.description 官方原文，不增删信息。缺省时页面显示原文
      translations: z.partialRecord(z.enum(LOCALES.map((l) => l.code)), z.object({ description: z.string().min(1) }).strict()).optional(),
      sources: z
        .array(z.object({ title: z.string(), url: z.url().startsWith('https://'), retrieved_at: date }).strict())
        .min(1),
      providers: z.array(
        z
          .object({
            id: z.string(),
            model: z.string(),
            base_url: z.string().regex(/^(https|wss):\/\//),
            endpoints: z.partialRecord(apiType, z.string().regex(/^(GET|POST|WS) \//)),
            reasoning_param: z.string().nullable(),
            reasoning_params: z.partialRecord(apiType, z.string().min(1).nullable()).optional(),
            reasoning_efforts: z.array(z.string()).optional(),
            limits: limits.optional(),
            modalities: modalities.optional(),
            features: z.array(feature).optional(),
            pricing: pricing.optional(),
          })
          .strict(),
      ),
    })
    .strict()
    .superRefine((m, ctx) => {
      for (const [index, p] of m.providers.entries()) {
        for (const [type, endpoint] of Object.entries(p.endpoints)) {
          if (endpoint.startsWith('WS ') !== p.base_url.startsWith('wss://')) {
            ctx.addIssue({ code: 'custom', path: ['providers', index, 'endpoints', type], message: 'WS 端点使用 wss://；HTTP 端点使用 https://，不同协议拆分 provider' });
          }
          if (!m.api.types.includes(type as z.infer<typeof apiType>)) {
            ctx.addIssue({ code: 'custom', path: ['providers', index, 'endpoints', type], message: 'provider 接口必须包含在 api.types 中' });
          }
          if (type === 'messages' && /\/chat\/completions\b/.test(endpoint)) {
            ctx.addIssue({ code: 'custom', path: ['providers', index, 'endpoints', type], message: 'Chat Completions 不能标为 messages' });
          }
        }
        for (const type of Object.keys(p.reasoning_params ?? {})) {
          if (!(type in p.endpoints)) ctx.addIssue({ code: 'custom', path: ['providers', index, 'reasoning_params', type], message: '思考参数必须对应已登记端点' });
        }
      }
      if (m.created !== null && m.info.release_date !== new Date(m.created * 1000).toISOString().slice(0, 10)) {
        ctx.addIssue({ code: 'custom', path: ['info', 'release_date'], message: 'release_date 必须与 created 一致' });
      }
      if (m.created === null && m.info.release_date !== null) {
        ctx.addIssue({ code: 'custom', path: ['created'], message: '有 release_date 时 created 不能为空' });
      }
    }),
});

/** 模型厂商：data/vendors/<id>.json，id 即模型的 owned_by */
const vendors = defineCollection({
  loader: glob({ pattern: '*.json', base: './data/vendors' }),
  schema: z
    .object({
      id: z.string().regex(/^[a-z0-9-]+$/),
      name: z.string().min(1),
      url: z.url().startsWith('https://'),
      /** @lobehub/icons-static-svg 中的单色图标名；缺省时显示首字母 */
      icon: z.string().regex(/^[a-z0-9-]+$/).optional(),
    })
    .strict(),
});

export const collections = { models, vendors };
