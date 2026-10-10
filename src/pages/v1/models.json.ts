import type { APIRoute } from 'astro';
import { getModels, toPublic } from '../../lib/models';

/** GET /v1/models：OpenAI 兼容的模型列表，构建时生成静态文件 */
export const GET: APIRoute = async () => {
  const data = (await getModels()).map(toPublic);
  return new Response(JSON.stringify({ object: 'list', data }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
