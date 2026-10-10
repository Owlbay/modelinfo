import type { CatalogIndexFile, SiteMeta } from "./catalog-types";

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/json" }, ...init });
  if (!response.ok) throw new Error(`模型目录请求失败 (${response.status})`);
  return (await response.json()) as T;
}

export interface LoadedCatalog {
  meta: SiteMeta;
  index: CatalogIndexFile;
}

/**
 * meta.json 为短缓存入口，每次重新验证；索引文件名带版本号，可长期缓存。
 * 若部署恰好切换导致旧版本索引 404，强制刷新 meta 后重试一次。
 */
export async function loadCatalog(signal?: AbortSignal): Promise<LoadedCatalog> {
  let meta = await getJson<SiteMeta>("/v1/meta.json", { cache: "no-cache", signal });
  try {
    return { meta, index: await getJson<CatalogIndexFile>(meta.catalog.files.index, { signal }) };
  } catch (error) {
    if (signal?.aborted) throw error;
    meta = await getJson<SiteMeta>("/v1/meta.json", { cache: "reload", signal });
    return { meta, index: await getJson<CatalogIndexFile>(meta.catalog.files.index, { signal }) };
  }
}
