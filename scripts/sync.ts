/**
 * 生成站点所需的全部静态数据，输出到 public/（vite build 时复制进 dist/）。
 *
 *   pnpm sync             严格模式：任一上游失败即退出，用于 CI
 *   pnpm sync --lenient   本地开发：上游失败时降级到内置样例
 *
 * 环境变量：
 *   SITE_URL         线上站点地址；设置后与线上 meta 比较，记录数骤降则失败
 *   MIN_RETAIN_RATIO 记录数下限比例，默认 0.7
 *   GITHUB_OUTPUT    存在时写入 changed=true|false 与 version
 */
import { appendFile, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CatalogIndexFile, ModelOffering, SiteMeta } from "../src/catalog-types";
import { indexProviders, providerSlug, toIndexRow, visibleRows } from "../src/lib/catalog";
import {
  getOfficialModels,
  officialCatalogStats,
  officialCatalogVersion,
  officialProviders,
  officialSources,
} from "./lib/official";
import { buildUpstreamCatalog, contentVersion } from "./lib/upstream";

const root = path.resolve(import.meta.dirname, "..");
const publicDir = path.join(root, "public");
const lenient = process.argv.includes("--lenient");

async function writeJson(relativePath: string, value: unknown) {
  const target = path.join(publicDir, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value)}\n`);
  return `/${relativePath.split(path.sep).join("/")}`;
}

async function previousMeta(): Promise<SiteMeta | null> {
  const siteUrl = process.env.SITE_URL?.replace(/\/+$/, "");
  if (!siteUrl) return null;
  try {
    const response = await fetch(`${siteUrl}/v1/meta.json`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      console.warn(`Previous meta unavailable (${response.status}), skipping comparison`);
      return null;
    }
    return (await response.json()) as SiteMeta;
  } catch (error) {
    console.warn("Previous meta unavailable, skipping comparison:", error);
    return null;
  }
}

function groupByProvider(offerings: ModelOffering[]) {
  const groups = new Map<string, ModelOffering[]>();
  const owners = new Map<string, string>();
  for (const offering of offerings) {
    const slug = providerSlug(offering.provider.id);
    const owner = owners.get(slug);
    if (owner && owner !== offering.provider.id) {
      throw new Error(`Provider slug collision: ${owner} and ${offering.provider.id} -> ${slug}`);
    }
    owners.set(slug, offering.provider.id);
    groups.set(slug, [...(groups.get(slug) ?? []), offering]);
  }
  return groups;
}

async function main() {
  // 官方数据：导入时已经过 validateOfficialCatalog 校验，失败会直接抛错。
  const generatedAt = new Date().toISOString();
  const [snapshot, previous] = await Promise.all([
    buildUpstreamCatalog({ lenient }),
    previousMeta(),
  ]);

  const rows = snapshot.offerings.map(toIndexRow);
  const total = visibleRows(rows).length;
  if (previous && !lenient) {
    const ratio = Number(process.env.MIN_RETAIN_RATIO ?? 0.7);
    const floor = Math.floor(previous.catalog.total * ratio);
    if (total < floor) {
      throw new Error(
        `Catalog shrank from ${previous.catalog.total} to ${total} (< ${floor}); refusing to publish`,
      );
    }
  }

  await rm(path.join(publicDir, "v1"), { recursive: true, force: true });
  await rm(path.join(publicDir, "data"), { recursive: true, force: true });

  // 公开 API：官方数据，按路径区分视图。
  await writeJson("v1/models.json", { object: "list", data: getOfficialModels() });
  for (const provider of officialProviders) {
    await writeJson(`v1/providers/${provider}/models.json`, {
      object: "list",
      data: getOfficialModels(provider),
    });
  }

  // 网站目录：精简索引 + 按 Provider 分片的完整记录，文件名带版本号以便长期缓存。
  const version = snapshot.version;
  const indexFile: CatalogIndexFile = {
    object: "catalog_index",
    version,
    generated_at: snapshot.generatedAt,
    providers: indexProviders(snapshot.offerings),
    data: rows,
  };
  const indexPath = await writeJson(`data/index.${version}.json`, indexFile);
  const providerFiles: Record<string, string> = {};
  for (const [slug, offerings] of groupByProvider(snapshot.offerings)) {
    providerFiles[offerings[0]!.provider.id] = await writeJson(
      `data/providers/${slug}.${version}.json`,
      { object: "list", provider: offerings[0]!.provider.id, version, data: offerings },
    );
  }

  const meta: SiteMeta = {
    object: "meta",
    status: "ok",
    generated_at: generatedAt,
    official: {
      version: officialCatalogVersion,
      models: officialCatalogStats.models,
      offerings: officialCatalogStats.offerings,
      providers: officialProviders,
      sources: officialSources().map((source) => ({
        id: source.id,
        url: source.url,
        retrieved_at: source.retrieved_at,
      })),
    },
    catalog: {
      version,
      generated_at: snapshot.generatedAt,
      source: snapshot.source,
      total,
      providers: Object.keys(providerFiles).length,
      sources: snapshot.sources,
      files: { index: indexPath, providers: providerFiles },
    },
  };
  await writeJson("v1/meta.json", meta);

  // 站点数据整体版本：官方与聚合任一变化即视为变化。
  const siteVersion = contentVersion({ official: officialCatalogVersion, catalog: version });
  const previousVersion = previous
    ? contentVersion({ official: previous.official.version, catalog: previous.catalog.version })
    : null;
  const changed = siteVersion !== previousVersion;

  console.log(
    `Synced ${rows.length} offerings (${total} visible) from ${snapshot.source}, ` +
      `${Object.keys(providerFiles).length} providers, catalog ${version}, ` +
      `official ${officialCatalogVersion}, changed=${changed}`,
  );
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `changed=${changed}\nversion=${siteVersion}\n`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
