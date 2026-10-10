import type {
  CatalogFacets,
  CatalogIndexFile,
  CatalogIndexRow,
  ModelOffering,
  ProviderFacet,
} from "../catalog-types";

const sourceNames: Record<string, string> = {
  src_models_dev: "models.dev",
  src_openrouter: "openrouter",
};

/** 由完整 Offering 生成网站列表使用的精简记录。 */
export function toIndexRow(offering: ModelOffering): CatalogIndexRow {
  const reasoning = offering.capabilities.reasoning;
  const effort = reasoning.controls.find((control) => control.type === "effort");
  const budget = reasoning.controls.find((control) => control.type === "budget_tokens");
  return {
    id: offering.id,
    provider: offering.provider.id,
    name: offering.name,
    owned_by: offering.owned_by,
    family: offering.family,
    canonical_id: offering.canonical_id,
    status: offering.lifecycle.status,
    released: offering.lifecycle.release_date,
    updated: offering.lifecycle.last_updated,
    context: offering.limits.tokens.context_window,
    max_output: offering.limits.tokens.max_output,
    price: offering.pricing
      ? { input: offering.pricing.summary.input, output: offering.pricing.summary.output }
      : null,
    input: offering.modalities.input.map((item) => item.type),
    output: offering.modalities.output.map((item) => item.type),
    apis: offering.supported_apis,
    reasoning: reasoning.supported,
    reasoning_efforts:
      effort?.type === "effort"
        ? effort.values.map((value) => value.id).filter((value): value is string => Boolean(value))
        : [],
    reasoning_budget: budget?.type === "budget_tokens" ? [budget.min, budget.max] : null,
    tool_call: offering.capabilities.tool_call,
    structured_output: offering.capabilities.structured_output,
    open_weights: offering.capabilities.open_weights,
    sources: [
      ...new Set(
        offering.provenance.sources.flatMap((source) =>
          sourceNames[source.id] ? [sourceNames[source.id]!] : [],
        ),
      ),
    ],
  };
}

export function indexProviders(offerings: ModelOffering[]): CatalogIndexFile["providers"] {
  const providers: CatalogIndexFile["providers"] = {};
  for (const offering of offerings) {
    providers[offering.provider.id] ??= {
      name: offering.provider.name,
      docs_url: offering.provider.docs_url,
    };
  }
  return providers;
}

export function offeringId(row: CatalogIndexRow) {
  return `${row.provider}/${row.id}`;
}

export type CatalogStatus = CatalogIndexRow["status"];

export const defaultStatuses: ReadonlySet<CatalogStatus> = new Set(["active", "beta"]);

export interface CatalogFilter {
  q?: string;
  provider?: string;
  inputModality?: string;
  reasoning?: boolean;
  minContext?: number;
  maxInputPrice?: number;
  statuses?: ReadonlySet<CatalogStatus>;
}

function matchesQuery(row: CatalogIndexRow, terms: string[], providerName?: string) {
  const haystack = [
    row.id,
    row.canonical_id,
    row.name,
    row.family,
    row.owned_by,
    row.provider,
    providerName,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

export function visibleRows(
  rows: CatalogIndexRow[],
  statuses: ReadonlySet<CatalogStatus> = defaultStatuses,
) {
  return rows.filter((row) => statuses.has(row.status));
}

export function filterRows(
  rows: CatalogIndexRow[],
  filter: CatalogFilter,
  providers: CatalogIndexFile["providers"] = {},
) {
  const terms = (filter.q ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const provider = filter.provider?.toLowerCase();
  const inputModality = filter.inputModality?.toLowerCase();
  const statuses = filter.statuses ?? defaultStatuses;

  return rows.filter((row) => {
    if (!statuses.has(row.status)) return false;
    if (terms.length && !matchesQuery(row, terms, providers[row.provider]?.name)) return false;
    if (provider && row.provider.toLowerCase() !== provider) return false;
    if (inputModality && !row.input.some((type) => type.toLowerCase() === inputModality)) {
      return false;
    }
    if (filter.reasoning !== undefined && row.reasoning !== filter.reasoning) {
      return false;
    }
    if (filter.minContext !== undefined && (row.context ?? -1) < filter.minContext) return false;
    if (filter.maxInputPrice !== undefined) {
      const input = row.price?.input;
      if (input === null || input === undefined || input > filter.maxInputPrice) return false;
    }
    return true;
  });
}

function providerFacets(
  rows: CatalogIndexRow[],
  providers: CatalogIndexFile["providers"],
): ProviderFacet[] {
  const facets = new Map<string, ProviderFacet>();
  for (const row of rows) {
    const current = facets.get(row.provider);
    if (current) current.count += 1;
    else {
      const name = providers[row.provider]?.name ?? row.provider;
      facets.set(row.provider, { id: row.provider, name, count: 1 });
    }
  }
  return [...facets.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function simpleFacets(rows: CatalogIndexRow[], getValues: (row: CatalogIndexRow) => string[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const value of new Set(getValues(row))) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
}

export function catalogFacets(
  rows: CatalogIndexRow[],
  providers: CatalogIndexFile["providers"] = {},
): CatalogFacets {
  return {
    providers: providerFacets(rows, providers),
    input_modalities: simpleFacets(rows, (row) => row.input),
    supported_apis: simpleFacets(rows, (row) => row.apis),
  };
}

/** 文件名安全的 Provider 标识，用于数据分片路径。 */
export function providerSlug(id: string) {
  return id.toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
}
