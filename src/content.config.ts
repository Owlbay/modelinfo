/**
 * 模型数据的唯一入口：data/models/*.json，构建时按 schema 校验，不合规即构建失败。
 * 字段定义见 docs/spec-v1-models.md。
 */
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const apiType = z.enum([
  'chat', 'messages', 'responses', 'completions', 'generate', 'batch', 'realtime',
  'embeddings', 'images', 'video', 'audio', '3d', 'rerank', 'ocr', 'moderation',
]);
const modality = z.enum(['text', 'image', 'audio', 'video', 'document', 'embedding', 'score', '3d']);
const feature = z.enum(['tools', 'structured_output', 'streaming', 'caching', 'batch']);
const tokens = z.number().int().positive().nullable();
const price = z.number().nonnegative().nullable();

const limits = z.object({ context: tokens, input: tokens, output: tokens }).strict();
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
      api: z.object({ types: z.array(apiType).min(1) }).strict(),
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
      sources: z
        .array(z.object({ title: z.string(), url: z.url().startsWith('https://'), retrieved_at: date }).strict())
        .min(1),
      providers: z.array(
        z
          .object({
            id: z.string(),
            model: z.string(),
            base_url: z.string().startsWith('https://'),
            endpoints: z.partialRecord(apiType, z.string().regex(/^(GET|POST) \//)),
            reasoning_param: z.string().nullable(),
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
